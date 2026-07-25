const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const crypto = require("crypto");
const { db, rtdb, FieldValue, appendRawMessage, getRawMessages, clearRawMessages, getUserProfile, saveUserProfile, registerActiveSession, getActiveSessions, deregisterActiveSession, getSessionMetadata, updateSessionMetadata, getGlobalParticipants, saveGlobalParticipants, saveFact, getFactsIndex, getFactDetail, saveSchedule, getUserSchedules, getAllSchedules, deleteSchedule, getDueSchedules } = require("./utils/db");
const line = require("./utils/line");
const telegram = require("./utils/telegram");

const llm = require("./utils/llm");
const { generateDailyNewsDigest } = require("./utils/news");

let cachedTgParticipants = null;
let cachedLineParticipants = null;
const userProfileCache = new Map();

// Cache lưu Index của Facts nhằm tối ưu băng thông RTDB
const globalFactsIndexCache = {
  data: null,
  lastUpdate: 0
};
const userFactsIndexCache = new Map(); // key: userId/groupId -> { data: {...}, expiresAt: timestamp }

// Smart Group Chat Caches & Config
const focusModeCache = new Map(); // key: chatId -> { userId, expiresAt }
const proactiveRateLimitCache = new Map(); // key: chatId -> nextAllowedTimestamp
const PROACTIVE_TRIGGER_WORDS = ["ai biết", "làm sao", "lỗi gì", "bug", "không chạy", "có cách nào", "bác nào", "mọi người", "xin ý kiến", "chịu"];

// Cấu hình Cache Idempotency chống lặp retry webhook
const processedWebhooks = new Set();
const maxCacheSize = 1000;
function cacheWebhookId(id) {
  if (processedWebhooks.size >= maxCacheSize) {
    const iterator = processedWebhooks.values();
    processedWebhooks.delete(iterator.next().value);
  }
  processedWebhooks.add(id);
}

// Tích hợp bộ lọc Prompt Leakage bằng JSON Blacklist
const leakBlacklist = require("./utils/leak_blacklist.json");
const isPromptLeakAttempt = (query) => {
  const cleanQuery = removeAccents(query.toLowerCase()).trim();
  return leakBlacklist.some(keyword => {
    const cleanKw = removeAccents(keyword.toLowerCase()).trim();
    return cleanKw && cleanQuery.includes(cleanKw);
  });
};


const findRelevantFacts = async (targetId, query) => {
  try {
    const now = Date.now();
    const cleanQuery = removeAccents(query.toLowerCase());
    const matchedFactIds = [];

    // 1. Kiểm tra Global Index Cache (TTL 10 phút)
    if (!globalFactsIndexCache.data || (now - globalFactsIndexCache.lastUpdate > 10 * 60 * 1000)) {
      console.log("[Facts Cache] Đang tải mới Global Index từ RTDB...");
      globalFactsIndexCache.data = await getFactsIndex("global", null);
      globalFactsIndexCache.lastUpdate = now;
    }

    const globalIndex = globalFactsIndexCache.data;
    for (const factId in globalIndex) {
      const item = globalIndex[factId];
      if (item.keywords) {
        const isMatch = item.keywords.some(kw => {
          const cleanKw = removeAccents(kw.toLowerCase()).trim();
          if (!cleanKw) return false;
          if (cleanQuery.includes(cleanKw)) return true;
          const words = cleanKw.split(/\s+/).filter(w => w.length > 2);
          if (words.length > 1) {
            const matchedWords = words.filter(w => cleanQuery.includes(w));
            if (matchedWords.length / words.length >= 0.7) return true;
          }
          return false;
        });
        if (isMatch) matchedFactIds.push({ type: "global", targetId: null, factId });
      }
    }

    // 2. Kiểm tra User/Group Index Cache (TTL 5 phút)
    let userCache = userFactsIndexCache.get(targetId);
    if (!userCache || now > userCache.expiresAt) {
      console.log(`[Facts Cache] Đang tải mới User Index cho ${targetId} từ RTDB...`);
      const indexData = await getFactsIndex("users", targetId);
      userCache = {
        data: indexData,
        expiresAt: now + 5 * 60 * 1000
      };
      userFactsIndexCache.set(targetId, userCache);
    }

    const userIndex = userCache.data;
    for (const factId in userIndex) {
      const item = userIndex[factId];
      if (item.keywords) {
        const isMatch = item.keywords.some(kw => {
          const cleanKw = removeAccents(kw.toLowerCase()).trim();
          if (!cleanKw) return false;
          if (cleanQuery.includes(cleanKw)) return true;
          const words = cleanKw.split(/\s+/).filter(w => w.length > 2);
          if (words.length > 1) {
            const matchedWords = words.filter(w => cleanQuery.includes(w));
            if (matchedWords.length / words.length >= 0.7) return true;
          }
          return false;
        });
        if (isMatch) matchedFactIds.push({ type: "users", targetId, factId });
      }
    }

    // 3. Tải nội dung chi tiết của các Fact trùng khớp
    if (matchedFactIds.length === 0) return "";

    console.log(`[Facts Search] Tìm thấy ${matchedFactIds.length} facts liên quan, đang tải chi tiết...`);
    const detailPromises = matchedFactIds.map(async ({ type, targetId, factId }) => {
      const detail = await getFactDetail(type, targetId, factId);
      return detail ? `- ${detail.content}` : null;
    });

    const details = await Promise.all(detailPromises);
    const validDetails = details.filter(Boolean);

    if (validDetails.length === 0) return "";
    return `\n\n[TRI THỨC BỘ NHỚ TỰ HỌC]:\n${validDetails.join("\n")}`;
  } catch (error) {
    console.error("[Facts Search] Lỗi tìm kiếm fact:", error.message);
    return "";
  }
};


// ─── CẤU HÌNH WHITELIST ──────────────────────────────────────────────────────
// Đặt "*" để cho phép tất cả mọi người dùng bot.

const ALLOWED_LINE_USERS = [
  "U6cc1a9cfda8d2f79d0aae1778becfb65",
  "*" // Đặt "*" để cho phép tất cả
];

const ALLOWED_TELEGRAM_USERS = [
  "2140581850",
  "730806080",
  "1098066961",
  "6753566898",
  "*"
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const isUserAllowed = (userId, platform) => {
  let list;
  if (platform === "TELEGRAM") list = ALLOWED_TELEGRAM_USERS;

  else list = ALLOWED_LINE_USERS;
  return list.includes("*") || list.includes(userId);
};
const buildGroupProfileContext = async (participantsMap, promptText = "", senderId = "", isGroup = false, senderName = "") => {
  const uniqueIds = [...new Set(Object.values(participantsMap))].filter(Boolean);
  const lowerPrompt = promptText.toLowerCase();

  const PROFILE_TRIGGER_KEYWORDS = ["anh", "chị", "tôi", "mình", "em", "nhớ", "quên", "sở thích", "tên gì", "làm gì", "quê", "vợ", "chồng", "con", "hôm trước", "nhà", "biết"];
  const hasTrigger = PROFILE_TRIGGER_KEYWORDS.some(kw => lowerPrompt.includes(kw));

  // Lấy profile song song bằng Promise.all (nhanh hơn ~50% so với for...of tuần tự)
  const results = await Promise.all(uniqueIds.map(async (uid) => {
    let name = Object.keys(participantsMap).find(k => participantsMap[k] === uid) || uid;
    const isSender = (uid === senderId);
    if (isSender && senderName) {
      name = senderName; // Ưu tiên tên gốc (có viết hoa) cho người gửi
    }
    const isMentioned = lowerPrompt.includes(name.toLowerCase());
    if (!isSender && !isMentioned) return null;

    let profile = userProfileCache.get(uid);
    if (!profile) {
      profile = await getUserProfile(uid);
      if (profile) userProfileCache.set(uid, profile);
    }
    if (!profile) return null;

    // Phục hồi original casing (viết hoa/viết thường) để LLM match chính xác với chat history
    if (profile.real_name) {
      name = profile.real_name;
    } else if (isSender && senderName) {
      name = senderName;
    }

    const p = [];
    if (profile.gender) p.push(`Giới tính: ${profile.gender}`);

    // Tầng 2: Full Traits (chỉ bơm khi có trigger hoặc bị mention trực tiếp)
    if (hasTrigger || isMentioned) {
      if (profile.public_traits) p.push(`Đặc điểm chung: ${profile.public_traits}`);
      if (!isGroup && profile.private_traits) p.push(`Thông tin riêng tư: ${profile.private_traits}`);

      if (profile.traits && Array.isArray(profile.traits) && profile.traits.length > 0) {
        p.push(`Đặc điểm cá nhân: ${profile.traits.join(" | ")}`);
      } else if (profile.traits && typeof profile.traits === "string") {
        p.push(`Đặc tính: ${profile.traits}`);
      }
    }

    return p.length > 0 ? `[${name}: ${p.join(", ")}] ` : `[${name}] `;
  }));

  const ctx = results.filter(Boolean).join("");
  const prefix = isGroup ? "Thông tin tập thể" : "Thông tin người dùng";
  return ctx ? `\n\n${prefix}: ${ctx.trim()}` : "";
};

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

const processAndExtractProfile = async (text, senderId, participants = {}, sessionId = null, senderName = "User", platform = "Telegram") => {
  let cleanedText = text;

  let topic = null;
  const topicMatch = cleanedText.match(/<TOPIC>(.*?)<\/TOPIC>/i);
  if (topicMatch) {
    topic = topicMatch[1].trim();
    console.log(`[Auto-Topic Sync] Phát hiện chủ đề mới: ${topic}`);
    cleanedText = cleanedText.replace(/<TOPIC>.*?<\/TOPIC>/gi, "");
  }

  const profileRegex = /<PROFILE\s+([^>]*)\/?>/gi;
  let match;

  while ((match = profileRegex.exec(text)) !== null) {
    const attrStr = match[1];
    const getAttr = (name) => {
      const r = new RegExp(`${name}=["']([^"']*)["']`, "i");
      const m = attrStr.match(r);
      return m ? m[1] : null;
    };

    const action = (getAttr("action") || "").toUpperCase();
    const trait = getAttr("trait");
    const old_trait = getAttr("old_trait");
    const new_trait = getAttr("new_trait");
    const userIdAttr = getAttr("userId");
    const real_name = getAttr("real_name");
    const gender = getAttr("gender");
    const public_traits = getAttr("public_traits");
    const private_traits = getAttr("private_traits");

    let uid = userIdAttr || senderId;

    if (userIdAttr) {
      const lowerUid = removeAccents(userIdAttr.trim().toLowerCase());
      if (participants[lowerUid]) {
        uid = participants[lowerUid];
        console.log(`[Profile] Phân giải tên "${userIdAttr}" thành ID thực: ${uid}`);
      } else {
        console.log(`[Profile] Không tìm thấy ID thực cho "${userIdAttr}", dùng tạm làm ID.`);
      }
    }

    if (action || real_name || gender || public_traits || private_traits) {
      const existing = userProfileCache.get(uid) || {};
      const updateData = {};
      let traitsArray = existing.traits ? (Array.isArray(existing.traits) ? [...existing.traits] : [existing.traits]) : [];

      if (real_name) updateData.real_name = real_name;
      if (gender) updateData.gender = gender;

      if (public_traits) updateData.public_traits = existing.public_traits ? existing.public_traits + ", " + public_traits : public_traits;
      if (private_traits) updateData.private_traits = existing.private_traits ? existing.private_traits + ", " + private_traits : private_traits;

      if (action === "ADD" && trait && !traitsArray.includes(trait)) {
        traitsArray.push(trait);
      } else if (action === "REMOVE" && trait) {
        traitsArray = traitsArray.filter(t => !t.toLowerCase().includes(trait.toLowerCase()));
      } else if (action === "UPDATE" && old_trait && new_trait) {
        traitsArray = traitsArray.map(t => t.toLowerCase().includes(old_trait.toLowerCase()) ? new_trait : t);
        if (!traitsArray.includes(new_trait)) traitsArray.push(new_trait);
      }

      if (action) updateData.traits = traitsArray;

      saveUserProfile(uid, updateData);
      userProfileCache.set(uid, { ...existing, ...updateData });
    }
  }

  // Bắt tag <SCHEDULE>
  const scheduleTagRegex = /<SCHEDULE\s+([^>]*)\/?>/gi;
  let scheduleMatch;
  while ((scheduleMatch = scheduleTagRegex.exec(text)) !== null) {
    const attrStr = scheduleMatch[1];
    const getAttr = (name) => {
      const r = new RegExp(`${name}=["']([^"']*)["']`, "i");
      const m = attrStr.match(r);
      return m ? m[1] : null;
    };

    const action = getAttr("action")?.toUpperCase();
    const targetId = sessionId || senderId; // Đặt cho session hoặc user cá nhân

    if (action === "ADD") {
      const type = getAttr("type") || "ONCE";
      const timeStr = getAttr("time");
      const prompt = getAttr("prompt");

      if (timeStr && prompt) {
        const scheduleId = "sch_" + Math.random().toString(36).substr(2, 5);
        let nextRun = 0;

        // Parse timeStr thành timestamp (rất cơ bản, có thể dùng thư viện tốt hơn sau)
        // Format YYYY-MM-DD HH:mm
        if (timeStr.length > 5) {
          const parsedDate = new Date(timeStr + ":00+07:00");
          if (!isNaN(parsedDate.getTime())) nextRun = parsedDate.getTime();
        } else if (timeStr.includes(":")) {
          // HH:mm for today
          const vnDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
          const [h, m] = timeStr.split(":");
          vnDate.setHours(parseInt(h), parseInt(m), 0, 0);
          nextRun = vnDate.getTime();
          if (nextRun < Date.now()) nextRun += 86400000; // Next day
        }

        if (nextRun > 0) {
          await saveSchedule({
            id: scheduleId,
            userId: targetId,
            type,
            timeStr,
            prompt,
            nextRun,
            platform,
            senderName,
            createdAt: Date.now()
          });
          cleanedText = cleanedText.replace(scheduleMatch[0], `\n[Hệ thống: Đã đặt lịch thành công với mã ${scheduleId}]`);
        }
      }
    } else if (action === "DEL" || action === "DELETE") {
      const schId = getAttr("id");
      if (schId) {
        await deleteSchedule(schId);
        cleanedText = cleanedText.replace(scheduleMatch[0], `\n[Hệ thống: Đã xóa lịch ${schId}]`);
      }
    } else if (action === "LIST") {
      const schedules = await getUserSchedules(targetId);
      if (schedules.length === 0) {
        cleanedText = cleanedText.replace(scheduleMatch[0], `\n[Hệ thống: Không có lịch hẹn nào]`);
      } else {
        const listStr = schedules.map(s => `- Mã: ${s.id}, Lịch: ${s.timeStr} (${s.type}), Yêu cầu: ${s.prompt}`).join("\n");
        cleanedText = cleanedText.replace(scheduleMatch[0], `\n[Hệ thống: Danh sách lịch hẹn]\n${listStr}`);
      }
    } else if (action === "ADMIN_LIST") {
      const TELEGRAM_ADMIN = process.env.TELEGRAM_ADMIN_APPPROVAL_ID || "-1003832428084";
      const LINE_ADMIN = process.env.LINE_ADMIN_APPPROVAL_ID || "";

      if (String(senderId) !== String(TELEGRAM_ADMIN) && String(senderId) !== String(LINE_ADMIN)) {
        cleanedText = cleanedText.replace(scheduleMatch[0], `\n[Hệ thống: Từ chối. Bạn không có quyền Admin để xem toàn bộ lịch hẹn!]`);
      } else {
        const schedules = await getAllSchedules();
        if (schedules.length === 0) {
          cleanedText = cleanedText.replace(scheduleMatch[0], `\n[Hệ thống: Không có lịch hẹn nào trên toàn hệ thống]`);
        } else {
          const listStr = schedules.map(s => `- User: ${s.senderName}, Mã: ${s.id}, Lịch: ${s.timeStr} (${s.type}), Yêu cầu: ${s.prompt}`).join("\n");
          cleanedText = cleanedText.replace(scheduleMatch[0], `\n[Hệ thống: Danh sách lịch hẹn]\n${listStr}`);
        }
      }
    }
  }

  // Bắt tag <FACT>
  const factTagRegex = /<FACT\s+([^>]*)\/?>/gi;
  let tagMatch;
  while ((tagMatch = factTagRegex.exec(text)) !== null) {
    const attrStr = tagMatch[1];

    // Helper bóc tách thuộc tính linh hoạt
    const getAttr = (name) => {
      const r = new RegExp(`${name}=["']([^"']*)["']`, "i");
      const m = attrStr.match(r);
      return m ? m[1] : null;
    };

    const action = getAttr("action")?.toUpperCase();
    const topic = getAttr("topic");
    const keywordsStr = getAttr("keywords");
    const content = getAttr("content");
    const link = getAttr("link") || "";

    if (action === "ADD" && content) {
      const factId = "fact_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
      const keywords = keywordsStr ? keywordsStr.split(",").map(k => k.trim().toLowerCase()) : [];
      const targetId = sessionId || senderId;

      // Lưu vào RTDB (mặc định scope users cho session/group hiện tại)
      await saveFact("users", targetId, factId, topic || "general", keywords, content, link);

      // Cập nhật nóng vào RAM Cache để có tác dụng ngay
      const userCache = userFactsIndexCache.get(targetId);
      if (userCache) {
        userCache.data[factId] = {
          topic: topic || "general",
          keywords
        };
      } else {
        userFactsIndexCache.set(targetId, {
          data: { [factId]: { topic: topic || "general", keywords } },
          expiresAt: Date.now() + 5 * 60 * 1000
        });
      }

      // Lưu pending fact để gửi phê duyệt cho Admin Eddy
      try {
        const pendingData = {
          targetId,
          topic: topic || "general",
          keywords,
          content,
          link,
          senderName,
          platform,
          createdAt: Date.now()
        };
        await rtdb.ref(`facts/pending/${factId}`).set(pendingData);
        console.log(`[Pending Fact] Đã lưu pending fact ${factId}`);

        const EDDY_TELEGRAM_ID = process.env.TELEGRAM_ADMIN_APPPROVAL_ID || "-1003832428084";
        const messageText = `💡 <b>Đề xuất Global Fact mới</b>\n` +
          `• <b>Người dạy:</b> ${senderName} (${platform})\n` +
          `• <b>Chủ đề:</b> ${topic || "general"}\n` +
          `• <b>Từ khóa:</b> ${keywords.join(", ")}\n` +
          `• <b>Nội dung:</b> ${content}\n` +
          `• <b>Nguồn chứng minh:</b> ${link ? `<a href="${link}">${link}</a>` : "Không có"}\n\n` +
          `<i>Nhấn nút dưới để phê duyệt làm Global Fact (dùng chung toàn hệ thống):</i>`;

        const replyMarkup = {
          inline_keyboard: [
            [
              { text: "✅ Duyệt Global", callback_data: JSON.stringify({ a: "ap_f", id: factId }) },
              { text: "❌ Từ chối", callback_data: JSON.stringify({ a: "rj_f", id: factId }) }
            ]
          ]
        };

        await telegram.sendInlineMarkup(EDDY_TELEGRAM_ID, messageText, replyMarkup);
        console.log(`[Pending Fact] Đã gửi thông báo duyệt cho Admin Eddy.`);
      } catch (err) {
        console.error("[Pending Fact] Lỗi lưu pending hoặc gửi duyệt:", err.message);
      }
    }
  }


  // Bắt tag <REACT>
  let reaction = null;
  const reactMatch = cleanedText.match(/<REACT\s+emoji=["']?([^"'\s>]+)["']?\s*\/?>/i);
  if (reactMatch) {
    let rawReaction = reactMatch[1].trim();

    // Telegram API Supported Reactions (73 emojis)
    const TELE_REACTS = ["👍", "👎", "❤", "🔥", "🥰", "👏", "😁", "🤔", "🤯", "😱", "🤬", "😢", "🎉", "🤩", "🤮", "💩", "🙏", "👌", "🕊", "🤡", "🥱", "🥴", "😍", "🐳", "❤‍🔥", "🌚", "🌭", "💯", "🤣", "⚡", "🍌", "🏆", "💔", "🤨", "😐", "🍓", "🍾", "💋", "🖕", "😈", "😴", "😭", "🤓", "👻", "👨‍💻", "👀", "🎃", "🙈", "😇", "😨", "🤝", "✍", "🤗", "🫡", "🎅", "🎄", "☃", "💅", "🤪", "🗿", "🆒", "💘", "🙉", "🦄", "😗", "💊", "🙊", "🕶", "👾", "🤷‍♂️", "🤷", "🤷‍♀️", "😡"];

    if (TELE_REACTS.includes(rawReaction)) {
      reaction = rawReaction;
    } else {
      // Fallback nếu LLM chọn emoji ngoài danh sách (để tránh lỗi 400)
      reaction = "❤";
      console.log(`[Reaction] Emoji không hợp lệ: ${rawReaction}, Fallback sang ${reaction}`);
    }

    console.log(`[Reaction] Chốt cảm xúc gửi đi: ${reaction}`);
    cleanedText = cleanedText.replace(/<REACT[^>]*>/gi, "");
  }

  cleanedText = cleanedText
    .replace(/<PROFILE[^>]*>|<\/PROFILE>/gi, "")
    .replace(/<FACT[^>]*>/gi, "")
    .replace(/\[THÔNG TIN TỪ INTERNET\]/gi, "thông tin trên Internet")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/["']?\s*\/>/g, "") // Dọn dẹp rác " /> do LLM sinh lỗi cú pháp thẻ XML
    .trim();
  return { text: cleanedText, topic, reaction };
};

/**
 * Xóa toàn bộ lịch sử chat của một session.
 * @param {string} sessionId
 */
const clearSessionHistory = async (sessionId) => {
  // 1. Xóa Bộ nhớ dài hạn (summaries) ở Document cha
  try {
    await db.collection("users").doc(sessionId).update({
      summaries: FieldValue.delete(),
      hotTopic: FieldValue.delete()
    }).catch(err => {
      if (err.code !== 5) throw err;
    });
    console.log(`[Firestore] Đã xóa summaries ở document cha: ${sessionId}`);
  } catch (error) {
    console.error(`[Reset Session] Lỗi xóa summaries ${sessionId}:`, error.message);
  }

  // 2. Xóa RTDB Raw Messages
  try {
    await clearRawMessages(sessionId);
    console.log(`[RTDB] Đã xóa tin nhắn thô: ${sessionId}`);
  } catch (error) {
    console.error(`[Reset Session] Lỗi xóa tin nhắn thô ${sessionId}:`, error.message);
  }

  // 3. Xóa Metadata (participants, hotTopic) trên RTDB & Cache
  try {
    await updateSessionMetadata(sessionId, { participants: {}, hotTopic: "" });
    console.log(`[RTDB/Cache] Đã reset metadata: ${sessionId}`);
  } catch (error) {
    console.error(`[Reset Session] Lỗi reset metadata ${sessionId}:`, error.message);
  }
};

const cleanText = (text) => text.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();

/**
 * Chuyển đổi các @tên trong câu trả lời của bot thành Telegram mention thực sự.
 * Dùng format HTML: <a href="tg://user?id=USER_ID">tên</a>
 * Hỗ trợ khớp không dấu (diacritic-insensitive).
 * @param {string} text - Nội dung câu trả lời của LLM
 * @param {Object} participants - Map {tên_thường: userId}
 * @returns {string}
 */
const convertTelegramMentions = (text, participants) => {
  if (!Object.keys(participants).length) return text;

  let result = text;
  // Sắp xếp tên giảm dần theo độ dài để match chính xác tên dài trước
  const sortedNames = Object.keys(participants).sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    const id = participants[name];
    const normName = removeAccents(name).toLowerCase();

    // Tạo regex khớp cả tên có dấu lẫn không dấu (ví dụ @Mạc Văn hoặc @mac van)
    const escapedNorm = normName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedOrig = removeAccents(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Tìm và thay thế tất cả @name tương ứng
    const pattern = new RegExp(`@(${escapedNorm}|${escapedOrig}|${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    result = result.replace(pattern, (match, matchedName) => {
      return `<a href="tg://user?id=${id}">${matchedName}</a>`;
    });
  }
  return result;
};

/**
 * Xây dựng message object LINE có mentions thực sự từ câu trả lời của bot.
 * Sử dụng đặc tả tin nhắn "textV2" mới nhất của LINE (Release tháng 10/2024),
 * tự động thay thế các nhãn @tên thành placeholder {user_N} và map qua substitution.
 * @param {string} text - Nội dung câu trả lời của LLM
 * @param {Object} participants - Map {tên_thường: userId}
 * @param {boolean} isGroup - True nếu chat trong group/room, False nếu 1-on-1
 * @returns {{ type: string, text: string, substitution?: Object }}
 */
const buildLineMessage = (text, participants, isGroup = true, hotTopic = "") => {
  let cleanedText = text.replace(/\*\*/g, ""); // Strip markdown bold

  let quickReply = undefined;
  const taskMatch = cleanedText.match(/<Task\s+mode="ASK"\s+tags="([^"]+)"\s*\/?>/i);
  if (taskMatch) {
    const tags = taskMatch[1].split("|").map(t => t.trim()).filter(Boolean);
    cleanedText = cleanedText.replace(/<Task[^>]*>/gi, "").trim();

    quickReply = {
      items: tags.map(tag => {
        const dataString = `action=quick_reply&text=${encodeURIComponent(tag)}&topic=${encodeURIComponent(hotTopic || "")}&ts=${Date.now()}`;
        return {
          type: "action",
          action: {
            type: "postback",
            label: tag.substring(0, 20),
            data: dataString.substring(0, 300),
            displayText: tag
          }
        };
      })
    };
  }

  // Luôn dọn dẹp sạch sẽ mọi thẻ <Task> còn sót lại (kể cả tag lỗi cấu trúc không khớp regex)
  cleanedText = cleanedText.replace(/<Task[^>]*>/gi, "").replace(/<\/Task>/gi, "").trim();

  // LINE API không hỗ trợ mentions trong chat 1-1, trả về text thường
  if (!isGroup) {
    return {
      type: "text",
      text: cleanedText,
      ...(quickReply && { quickReply })
    };
  }

  const sortedNames = Object.keys(participants).sort((a, b) => b.length - a.length);

  const substitution = {};
  let replacedText = cleanedText;
  let placeholderCount = 0;

  // Đi qua từng tên participant, tìm các vị trí có @tên (không phân biệt dấu/hoa thường)
  for (const name of sortedNames) {
    const userId = participants[name];
    const normName = removeAccents(name).toLowerCase();

    // Tạo regex khớp cả tên có dấu lẫn không dấu
    const escapedName = normName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`@${escapedName}`, "gi");

    // Tìm kiếm vị trí khớp trên văn bản đã chuẩn hóa và thay thế
    while (true) {
      const normText = removeAccents(replacedText).toLowerCase();
      // Để tránh lặp vô tận, chúng ta kiểm tra xem pattern còn khớp không
      const match = pattern.exec(normText);
      if (!match) break;

      const placeholderKey = `user_${placeholderCount++}`;

      // Thực hiện thay thế đoạn match trong chuỗi gốc bằng {placeholderKey}
      replacedText =
        replacedText.substring(0, match.index) +
        `{${placeholderKey}}` +
        replacedText.substring(match.index + match[0].length);

      // Đưa thông tin tag vào substitution theo đặc tả textV2
      substitution[placeholderKey] = {
        type: "mention",
        mentionee: {
          type: "user",
          userId: userId
        }
      };
    }
  }

  // Nếu có mention, trả về dạng textV2
  if (Object.keys(substitution).length > 0) {
    return {
      type: "textV2",
      text: replacedText,
      substitution: substitution,
      ...(quickReply && { quickReply })
    };
  }

  // Nếu không có mention, trả về dạng text thường để tối ưu
  return {
    type: "text",
    text: cleanedText,
    ...(quickReply && { quickReply })
  };
};

// ─── WEBHOOK ─────────────────────────────────────────────────────────────────

exports.webhook = onRequest({
  timeoutSeconds: 300,
  memory: "256MiB",
  maxInstances: 10
}, async (req, res) => {
  const isTelegram = req.body && (req.body.message || req.body.callback_query || req.body.edited_message || req.body.channel_post);

  if (req.method === "GET") {
    return res.status(200).send("OK GET");
  }

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ── TELEGRAM ──────────────────────────────────────────────────────────────
  if (isTelegram) {
    if (req.body && req.body.update_id) {
      if (processedWebhooks.has(req.body.update_id)) {
        console.log(`[Telegram] Bỏ qua request bị lặp (update_id: ${req.body.update_id})`);
        return res.status(200).send("OK");
      }
      cacheWebhookId(req.body.update_id);
    }
    const secretToken = process.env.TELEGRAM_SECRET_TOKEN;
    if (secretToken && req.headers["x-telegram-bot-api-secret-token"] !== secretToken) {
      console.warn("[Telegram] TỪ CHỐI REQUEST: Sai Secret Token. Có dấu hiệu giả mạo Webhook!");
      return res.status(401).send("Unauthorized");
    }

    const { callback_query } = req.body;
    let message = req.body.message;

    let isPostback = false;
    let postbackContext = "";

    if (callback_query) {
      isPostback = true;
      message = callback_query.message;
      if (message) {
        postbackContext = message.text || message.caption || "";
        // Ẩn bàn phím inline ngay lập tức để User biết đã nhận lệnh
        telegram.editMessageReplyMarkup(message.chat.id, message.message_id, { inline_keyboard: [] });
        message.from = callback_query.from; // Cập nhật người gửi từ callback

        // Phân biệt: Nếu là callback duyệt/từ chối fact của admin Eddy
        if (callback_query.data) {
          try {
            const payload = JSON.parse(callback_query.data);
            if (payload.a === "ap_f" || payload.a === "rj_f") {
              const factId = payload.id;

              // Gọi answerCallbackQuery để Telegram tắt xoay cát loading
              const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
              const TELEGRAM_BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
              const axios = require("axios");
              try {
                await axios.post(`${TELEGRAM_BASE_URL}/answerCallbackQuery`, {
                  callback_query_id: callback_query.id,
                  text: payload.a === "ap_f" ? "Đang phê duyệt..." : "Đang từ chối..."
                });
              } catch (e) {
                console.error("[Telegram] Lỗi answerCallbackQuery:", e.message);
              }

              if (payload.a === "ap_f") {
                // Duyệt Fact: đọc từ facts/pending/${factId}
                const pendingSnap = await rtdb.ref(`facts/pending/${factId}`).once("value");
                if (pendingSnap.exists()) {
                  const pendingData = pendingSnap.val();

                  // Lưu thành global fact
                  await saveFact("global", null, factId, pendingData.topic, pendingData.keywords, pendingData.content, pendingData.link || "");

                  // Xóa khỏi pending
                  await rtdb.ref(`facts/pending/${factId}`).remove();

                  // Reset RAM Cache global
                  globalFactsIndexCache.data = null;
                  globalFactsIndexCache.lastUpdate = 0;

                  const updatedText = `✅ <b>ĐÃ PHÊ DUYỆT LÀM GLOBAL FACT!</b>\n\n` +
                    `• <b>Người dạy:</b> ${pendingData.senderName} (${pendingData.platform})\n` +
                    `• <b>Chủ đề:</b> ${pendingData.topic}\n` +
                    `• <b>Nội dung:</b> ${pendingData.content}\n` +
                    `• <b>Nguồn chứng minh:</b> ${pendingData.link ? `<a href="${pendingData.link}">${pendingData.link}</a>` : "Không có"}`;
                  await telegram.editMessageText(message.chat.id, message.message_id, updatedText);
                } else {
                  await telegram.reply(message.chat.id, `❌ Fact ${factId} không tồn tại hoặc đã được xử lý.`);
                }
              } else {
                // Từ chối Fact
                const pendingSnap = await rtdb.ref(`facts/pending/${factId}`).once("value");
                if (pendingSnap.exists()) {
                  const pendingData = pendingSnap.val();
                  await rtdb.ref(`facts/pending/${factId}`).remove();

                  const updatedText = `❌ <b>ĐÃ TỪ CHỐI THÊM GLOBAL FACT!</b>\n\n` +
                    `• <b>Người dạy:</b> ${pendingData.senderName} (${pendingData.platform})\n` +
                    `• <b>Nội dung:</b> ${pendingData.content}\n` +
                    `• <b>Nguồn chứng minh:</b> ${pendingData.link ? `<a href="${pendingData.link}">${pendingData.link}</a>` : "Không có"}`;
                  await telegram.editMessageText(message.chat.id, message.message_id, updatedText);
                } else {
                  await rtdb.ref(`facts/pending/${factId}`).remove();
                  await telegram.reply(message.chat.id, `❌ Đã hủy yêu cầu phê duyệt fact.`);
                }
              }
              return res.end();
            }
          } catch (e) {
            // Không phải JSON của duyệt fact, tiếp tục
          }
        }

        if (callback_query.data && callback_query.data.startsWith('{"ts":')) {
          try {
            const payload = JSON.parse(callback_query.data);
            const now = Date.now();
            if (now - payload.ts > 30000) {
              console.log(`[Telegram] Callback hết hạn (${now - payload.ts}ms)`);
              telegram.sendMessage(message.chat.id, "Dạ đã hết thời gian chọn lựa (quá 30s), nếu anh chị có câu hỏi khác thì cứ hỏi em nha! ⏳");
              return res.end();
            }
            message.text = payload.t;
          } catch (e) {
            message.text = callback_query.data;
          }
        } else {
          message.text = callback_query.data;
        }
      }
    }

    if (!message) return res.end();

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const chatType = message.chat.type; // "private" | "group" | "supergroup" | "channel"

    console.log(`[Telegram] User: ${userId} | Chat: ${chatId} | Type: ${chatType}`);

    // Kiểm tra whitelist — nếu không được phép, tự thoát khỏi group
    if (!isUserAllowed(userId, "TELEGRAM")) {
      console.log(`[Telegram] Từ chối User ${userId}`);
      if (chatType !== "private") await telegram.leaveChat(chatId);
      return res.end();
    }

    // Xử lý tin nhắn (Text, Ảnh, Document)
    let messageContent = message.text || message.caption || null;

    if (messageContent && messageContent.trim() === "/start") {
      await telegram.reply(chatId, "Dạ em chào anh chị! Em là Annie đây ạ 🥰. Anh chị cần tra cứu tin tức, hỏi đáp hay lấy lịch thi đấu bóng đá thì cứ nhắn em nhé, em sẵn sàng 24/7 luôn ạ! ✨");
      return res.end();
    }

    // [COST MINIMIZATION] Block direct video/audio processing requests offline
    if (messageContent && /(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc).*?\b(video|audio|âm thanh|mp4|mp3|youtube)\b|\b(video|audio|âm thanh|mp4|mp3|youtube)\b.*?(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc)/i.test(messageContent)) {
      await telegram.reply(chatId, "Dạ hiện tại em chưa hỗ trợ tính năng trích xuất nội dung trực tiếp từ Video/Audio ạ. 😅");
      return res.end();
    }

    let isImage = false;

    const botUsername = (process.env.TELEGRAM_BOT_USERNAME || "").toLowerCase();
    let isDirectlyTargeted = chatType === "private" ||
      (botUsername && messageContent && messageContent.toLowerCase().includes(`@${botUsername}`)) ||
      (botUsername && message.reply_to_message?.from?.username?.toLowerCase() === botUsername) ||
      (message.entities && message.entities.some(e =>
        (e.type === "mention" && messageContent.substring(e.offset, e.offset + e.length).toLowerCase() === `@${botUsername}`) ||
        (e.type === "text_mention" && e.user?.username?.toLowerCase() === botUsername)
      ));
    let isImplicitlyTargeted = !isDirectlyTargeted && messageContent && /\bannie\b/i.test(messageContent);
    let isProactiveTargeted = false;

    // --- Smart Group Chat: Focus Mode ---
    if (chatType !== "private" && !isDirectlyTargeted && !isImplicitlyTargeted) {
      const focus = focusModeCache.get(String(chatId));
      if (focus && focus.userId === String(userId) && Date.now() < focus.expiresAt) {
        const hasOtherMentions = /@\w+\b/gi.test(messageContent) && !messageContent.toLowerCase().includes(`@${botUsername}`);
        if (!hasOtherMentions) {
          isImplicitlyTargeted = true;
          console.log(`[Focus Mode] Telegram: Bot tự động follow up với User ${userId} trong Group ${chatId}`);
        }
      }
    }

    // --- Smart Group Chat: Proactive Intervention ---
    if (chatType !== "private" && !isDirectlyTargeted && !isImplicitlyTargeted && messageContent) {
      const hasTrigger = messageContent.length > 10 && PROACTIVE_TRIGGER_WORDS.some(w => messageContent.toLowerCase().includes(w));
      if (hasTrigger) {
        const nextAllowed = proactiveRateLimitCache.get(String(chatId)) || 0;
        if (Date.now() >= nextAllowed) {
          isProactiveTargeted = true;
          console.log(`[Proactive] Telegram: Triggered in Group ${chatId}`);
        }
      }
    }

    const shouldProcessMedia = chatType === "private" || isDirectlyTargeted || isImplicitlyTargeted || isProactiveTargeted;
    // Lazy Image: Ảnh/file gửi thuần (không kèm caption) → lưu placeholder, không OCR ngay
    const hasCaption = !!(message.caption && message.caption.trim());
    const isRawMedia = (message.photo || message.document) && !hasCaption;

    if (shouldProcessMedia && !isRawMedia) {
      if (message.photo) {
        console.log(`[Telegram] Đang xử lý ảnh từ User ${userId}...`);
        const fileId = message.photo[message.photo.length - 1].file_id;
        const imageBinary = await telegram.getImageBinary(fileId);
        const imgDesc = await llm.multimodal(imageBinary);
        messageContent = (messageContent ? messageContent + "\n" : "") + `[BỨC ẢNH NGƯỜI DÙNG VỪA GỬI ĐẾN]: "${imgDesc.trim()}"`;
        isImage = true;
      } else if (message.document) {
        const fileName = message.document.file_name || "document";
        console.log(`[Telegram] Đang xử lý file ${fileName} từ User ${userId}...`);
        const localPath = await telegram.downloadMessageFile(message.document.file_id, fileName);
        const fileDesc = await llm.analyzeDocument(localPath);
        messageContent = (messageContent ? messageContent + "\n" : "") + `[TÀI LIỆU NGƯỜI DÙNG VỪA GỬI ĐẾN: ${fileName}]:\n"${fileDesc.trim()}"`;
        isImage = true;
      } else if (message.reply_to_message?.photo) {
        console.log(`[Telegram] Đang xử lý ảnh được trích dẫn từ User ${userId}...`);
        const fileId = message.reply_to_message.photo[message.reply_to_message.photo.length - 1].file_id;
        const imageBinary = await telegram.getImageBinary(fileId);
        const imgDesc = await llm.multimodal(imageBinary);
        messageContent = (messageContent ? messageContent + "\n" : "") + `[BỨC ẢNH ĐƯỢC TRÍCH DẪN]: "${imgDesc.trim()}"`;
        isImage = true;
      } else if (message.reply_to_message?.document) {
        const fileName = message.reply_to_message.document.file_name || "document";
        console.log(`[Telegram] Đang xử lý file được trích dẫn ${fileName} từ User ${userId}...`);
        const localPath = await telegram.downloadMessageFile(message.reply_to_message.document.file_id, fileName);
        const fileDesc = await llm.analyzeDocument(localPath);
        messageContent = (messageContent ? messageContent + "\n" : "") + `[TÀI LIỆU ĐƯỢC TRÍCH DẪN: ${fileName}]:\n"${fileDesc.trim()}"`;
        isImage = true;
      }
    }

    // Lazy Image (Private chat): lưu placeholder nếu ảnh/file không có caption
    if (isRawMedia) {
      let senderNameForPlaceholder = message.from.first_name || message.from.username || "User";
      const profileForPlaceholder = await getUserProfile(userId);
      if (profileForPlaceholder?.real_name) senderNameForPlaceholder = profileForPlaceholder.real_name;

      const mediaId = message.photo
        ? message.photo[message.photo.length - 1].file_id
        : message.document.file_id;
      const mediaType = message.photo ? "image" : "document";
      const placeholderText = message.photo
        ? "[HÌNH ẢNH]"
        : `[TÀI LIỆU: ${message.document.file_name || "document"}]`;

      console.log(`[Telegram] Lazy Image (${chatType}): lưu placeholder, không OCR ngay.`);
      const userMsg = {
        role: "user",
        text: placeholderText,
        senderName: senderNameForPlaceholder,
        senderId: userId,
        mediaId,
        mediaType,
        createdAt: new Date().toISOString()
      };
      await appendRawMessage(String(chatId), userMsg);
      await registerActiveSession(String(chatId));
      return res.end();
    }

    if (!messageContent) return res.end();

    let senderName = message.from.first_name || message.from.username || "User";
    const profile = await getUserProfile(userId);
    if (profile && profile.real_name) {
      senderName = profile.real_name;
    }

    // Lệnh bí mật: force nén dữ liệu
    if (!isImage && cleanText(messageContent).toLowerCase() === "tóm tắt chủ đề") {
      const rawMessages = await getRawMessages(String(chatId));
      if (rawMessages && rawMessages.length > 0) {
        const summaryText = await llm.summarizeHistory(rawMessages, String(chatId));
        if (summaryText) {
          let hotTopic = null;
          const topicMatch = summaryText.match(/\[HOT_TOPIC:(.*?)\]/i);
          if (topicMatch) {
            const topicStr = topicMatch[1].trim();
            if (topicStr.toLowerCase() !== "none") hotTopic = topicStr;
          }
          await updateSessionMetadata(String(chatId), { hotTopic });
          await telegram.reply(chatId, `Đã ép tóm tắt xong! Chủ đề nóng hiện tại là: ${hotTopic}`);
          await clearRawMessages(String(chatId));
          await deregisterActiveSession(String(chatId));
        }
      } else {
        await telegram.reply(chatId, "Không có tin nhắn nào để tóm tắt ạ.");
      }
      return res.end();
    }

    // Lệnh reset bộ nhớ
    if (!isImage && cleanText(messageContent).toLowerCase() === "quên hết đi nào") {
      await clearSessionHistory(String(chatId));
      await telegram.reply(chatId, "Em mất trí nhớ rồi, huhu!");
      return res.end();
    }

    // Group chat: lưu background history (ảnh không tag bot đã xử lý ở block isRawMedia trên)
    if (chatType !== "private") {
      if (!isDirectlyTargeted && !isImplicitlyTargeted && !isProactiveTargeted) {
        const userMsg = {
          role: "user",
          text: messageContent || "",
          senderName,
          senderId: userId,
          createdAt: new Date().toISOString()
        };
        await appendRawMessage(String(chatId), userMsg);
        await registerActiveSession(String(chatId));
        return res.end();
      }
    }
    // Lấy participants lịch sử và hotTopic từ RTDB có Cache RAM
    await registerActiveSession(String(chatId));
    const sessionData = await getSessionMetadata(String(chatId));
    const sessionParticipants = sessionData.participants || {};
    const hotTopic = sessionData.hotTopic || "";

    // Cập nhật bản đồ tên → userId (participants) TOÀN CỤC cho Telegram (với cache RAM)
    if (!cachedTgParticipants) {
      cachedTgParticipants = await getGlobalParticipants("tg");
    }

    // Gộp và cập nhật tên người gửi mới
    const participants = { ...sessionParticipants, ...cachedTgParticipants };

    let hasNewData = false;
    const lowerName = senderName.toLowerCase();
    if (participants[lowerName] !== userId) {
      participants[lowerName] = userId;
      cachedTgParticipants[lowerName] = userId;
      hasNewData = true;
    }
    if (message.from.username) {
      const lowerUsername = message.from.username.toLowerCase();
      if (participants[lowerUsername] !== userId) {
        participants[lowerUsername] = userId;
        cachedTgParticipants[lowerUsername] = userId;
        hasNewData = true;
      }
    }

    // Lưu bất đồng bộ sang global nếu có dữ liệu mới
    if (hasNewData) {
      await saveGlobalParticipants("tg", cachedTgParticipants);
    }

    // Nếu người dùng reply (trích dẫn) một tin nhắn khác, đính kèm nội dung đó vào prompt
    let cleanPrompt = messageContent;

    // Chặn Prompt Leakage offline để bảo vệ hệ thống & tiết kiệm 100% token/chi phí
    if (isPromptLeakAttempt(cleanPrompt)) {
      console.log(`[Prompt Protection] Phát hiện gài bẫy prompt từ ${senderName}: "${cleanPrompt}"`);
      const secureReply = "Dạ, em không thể tiết lộ cấu hình hệ thống đâu nè! 🤫 Tụi mình trò chuyện chuyện khác vui hơn nha! Chúc anh/chị một ngày vui vẻ! ✨";
      const userMsgData = { role: "user", text: messageContent, senderName, senderId: userId, createdAt: new Date().toISOString() };
      const botMsgData = { role: "model", text: secureReply, createdAt: new Date().toISOString() };

      await appendRawMessage(String(chatId), userMsgData, botMsgData);
      await telegram.reply(chatId, secureReply);
      return res.end();
    }

    let quoteContext = "";
    if (message.reply_to_message) {
      const replied = message.reply_to_message;
      const repliedFrom = replied.from?.first_name || replied.from?.username || "ai đó";
      const repliedText = replied.text || replied.caption || "";
      if (repliedText) {
        quoteContext = `[Đang trả lời tin nhắn của ${repliedFrom}: "${repliedText}"]\n`;
      }
    } else if (chatType === "private") {
      const lastMsgSnap = await rtdb.ref(`chats/${chatId}/messages`).orderByKey().limitToLast(5).once("value");
      if (lastMsgSnap.exists()) {
        const lastMsgs = Object.values(lastMsgSnap.val());
        const mediaMsg = lastMsgs.reverse().find(m => m.mediaId);
        if (mediaMsg) {
          if (mediaMsg.mediaType === "image") {
            const imageBinary = await telegram.getImageBinary(mediaMsg.mediaId);
            const imgDesc = await llm.multimodal(imageBinary);
            quoteContext = `[BỨC ẢNH ĐƯỢC NHẮC ĐẾN]: "${imgDesc.trim()}"\n`;
          } else if (mediaMsg.mediaType === "document") {
            const docNameMatch = mediaMsg.text.match(/\[TÀI LIỆU:\s*(.*?)\]/);
            const fileName = docNameMatch ? docNameMatch[1] : "document";
            const localPath = await telegram.downloadMessageFile(mediaMsg.mediaId, fileName);
            const fileDesc = await llm.analyzeDocument(localPath);
            quoteContext = `[TÀI LIỆU ĐƯỢC NHẮC ĐẾN: ${fileName}]:\n"${fileDesc.trim()}"\n`;
          }
        }
      }
    }

    const forceIgnoreCheck = (!isDirectlyTargeted && isImplicitlyTargeted);
    const isGroup = chatType !== "private";
    const groupContext = await buildGroupProfileContext(participants, cleanPrompt, userId, isGroup, senderName);
    const factsContext = await findRelevantFacts(String(chatId), cleanPrompt);
    const rawMsg = await llm.chat(String(chatId), cleanPrompt, senderName, userId, null, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext, factsContext, isProactiveTargeted);

    const userMsgData = { role: "user", text: messageContent, senderName, senderId: userId, createdAt: new Date().toISOString() };

    if (rawMsg.trim() === "IGNORE") {
      await appendRawMessage(String(chatId), userMsgData);
      return res.end();
    }

    const { text: botMsgText, topic, reaction } = await processAndExtractProfile(rawMsg, userId, participants, String(chatId), senderName, "Telegram");

    if (topic) {
      await updateSessionMetadata(String(chatId), { hotTopic: topic });
    }

    if (reaction) {
      await telegram.setMessageReaction(chatId, message.message_id, reaction);
    }

    // Convert @name → Telegram HTML mention thực sự
    const msg = convertTelegramMentions(botMsgText, participants);
    await telegram.reply(chatId, msg);

    const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
    await appendRawMessage(String(chatId), userMsgData, botMsgData);

    if (chatType !== "private") {
      focusModeCache.set(String(chatId), { userId: String(userId), expiresAt: Date.now() + 3 * 60 * 1000 });
      if (isProactiveTargeted) {
        proactiveRateLimitCache.set(String(chatId), Date.now() + 60 * 60 * 1000);
      }
    }

    return res.end();

    return res.end();
  }

  // ── LINE ──────────────────────────────────────────────────────────────────
  if (req.body && req.body.events) {
    // [IDEMPOTENCY] Chống webhook lặp của LINE
    const retryKey = req.headers["x-line-retry-key"];
    if (retryKey) {
      if (processedWebhooks.has(retryKey)) {
        console.log(`[LINE] Bỏ qua request bị lặp (retry_key: ${retryKey})`);
        return res.status(200).send("OK");
      }
      cacheWebhookId(retryKey);
    }

    // [SECURITY] Xác thực Chữ ký Webhook của LINE
    const channelSecret = process.env.CHANNEL_SECRET;
    if (channelSecret) {
      try {
        const signature = crypto.createHmac("SHA256", channelSecret).update(req.rawBody).digest("base64");
        if (signature !== req.headers["x-line-signature"]) {
          console.warn("[LINE] TỪ CHỐI REQUEST: Sai x-line-signature. Có dấu hiệu giả mạo Webhook!");
          return res.status(401).send("Unauthorized");
        }
      } catch (err) {
        console.error("[LINE] Lỗi xác thực chữ ký:", err.message);
      }
    }

    const { events } = req.body;
    if (!events) return res.end();

    for (const event of events) {
      if (event.source?.userId) {
        console.log(`[LINE] User: ${event.source.userId} | Type: ${event.source.type}`);
      }

      if (event.type !== "message" && event.type !== "postback") continue;

      const userId = event.source.userId;
      const type = event.source.type; // "user", "group", "room"
      const groupId = event.source.groupId || event.source.roomId || "none";

      console.log(`[LINE] User: ${userId} | Type: ${type} | GroupID: ${groupId}`);

      // Kiểm tra whitelist
      if (!isUserAllowed(userId, "LINE")) {
        console.log(`[LINE] Từ chối User ${userId}`);
        continue;
      }

      // ── Xử lý tin nhắn (Text hoặc Image trong 1-1)
      let messageContent = null;
      let isImage = false;
      const eventMessageId = event.message?.id || `postback_${Date.now()}`;

      let isPostback = false;
      let postbackContext = "";

      if (event.type === "postback") {
        isPostback = true;
        try {
          const data = new URLSearchParams(event.postback.data);
          if (data.get("action") === "quick_reply") {
            const ts = parseInt(data.get("ts") || "0", 10);
            const now = Date.now();
            if (ts > 0 && now - ts > 30000) {
              console.log(`[LINE] Postback hết hạn (${now - ts}ms)`);
              await line.replyMessage(event.replyToken, [{
                type: "text",
                text: "Dạ đã hết thời gian chọn lựa (quá 30s), nếu anh chị có câu hỏi khác thì cứ hỏi em nha! ⏳"
              }]);
              return;
            }

            const text = data.get("text");
            const topic = data.get("topic");
            messageContent = text;
            console.log(`[LINE] Nhận postback Quick Reply: ${messageContent}`);
          }
        } catch (err) {
          console.error("[LINE] Lỗi parse postback:", err);
        }
      } else if (event.type === "message" && event.message.type === "text") {
        messageContent = event.message.text;
      } else if (event.message?.type === "image") {
        const sessionId = event.source.groupId || event.source.roomId || userId;
        const sessionData = await getSessionMetadata(sessionId);
        const sessionParticipants = sessionData.participants || {};
        const cachedParticipants = await getGlobalParticipants("line");
        const participants = { ...sessionParticipants, ...cachedParticipants };
        const senderName = Object.keys(participants).find(key => participants[key] === userId) || "User";

        const userMsg = {
          role: "user",
          text: "[HÌNH ẢNH]",
          mediaId: event.message.id,
          mediaType: "image",
          senderName,
          senderId: userId,
          lineMessageId: event.message.id,
          createdAt: new Date().toISOString()
        };
        await appendRawMessage(sessionId, userMsg);
        await registerActiveSession(sessionId);
        continue;
      } else if (event.message?.type === "file") {
        const sessionId = event.source.groupId || event.source.roomId || userId;
        const sessionData = await getSessionMetadata(sessionId);
        const sessionParticipants = sessionData.participants || {};
        const cachedParticipants = await getGlobalParticipants("line");
        const participants = { ...sessionParticipants, ...cachedParticipants };
        const senderName = Object.keys(participants).find(key => participants[key] === userId) || "User";
        const fileName = event.message.fileName || "document";

        const userMsg = {
          role: "user",
          text: `[TÀI LIỆU: ${fileName}]`,
          mediaId: event.message.id,
          mediaType: "document",
          senderName,
          senderId: userId,
          lineMessageId: event.message.id,
          createdAt: new Date().toISOString()
        };
        await appendRawMessage(sessionId, userMsg);
        await registerActiveSession(sessionId);
        continue;
      }

      if (!messageContent) continue;

      // [COST MINIMIZATION] Block direct video/audio processing requests offline
      if (/(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc).*?\b(video|audio|âm thanh|mp4|mp3|youtube)\b|\b(video|audio|âm thanh|mp4|mp3|youtube)\b.*?(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc)/i.test(messageContent)) {
        await line.replyMessage(event.replyToken, [{ type: "text", text: "Dạ hiện tại em chưa hỗ trợ tính năng trích xuất nội dung trực tiếp từ Video/Audio ạ. 😅" }]);
        continue;
      }

      const sessionId = event.source.groupId || event.source.roomId || userId;

      // Lệnh reset bộ nhớ
      if (!isImage && cleanText(messageContent).toLowerCase() === "quên hết đi nào") {
        await clearSessionHistory(sessionId);
        await line.reply(event.replyToken, [{ type: "text", text: "Em mất trí nhớ rồi, huhu!" }]);
        continue;
      }

      // Lệnh bí mật: force nén dữ liệu
      if (!isImage && cleanText(messageContent).toLowerCase() === "tóm tắt chủ đề") {
        const rawMessages = await getRawMessages(sessionId);
        if (rawMessages && rawMessages.length > 0) {
          const summaryText = await llm.summarizeHistory(rawMessages, sessionId);
          if (summaryText) {
            let hotTopic = null;
            const topicMatch = summaryText.match(/\[HOT_TOPIC:(.*?)\]/i);
            if (topicMatch) {
              const topicStr = topicMatch[1].trim();
              if (topicStr.toLowerCase() !== "none") hotTopic = topicStr;
            }
            const sessionRef = db.collection("users").doc(sessionId);
            await sessionRef.set({ hotTopic }, { merge: true });
            await line.reply(event.replyToken, [{ type: "text", text: `Đã ép tóm tắt xong! Chủ đề nóng hiện tại là: ${hotTopic}` }]);
            await clearRawMessages(sessionId);
          }
        } else {
          await line.reply(event.replyToken, [{ type: "text", text: "Không có tin nhắn nào để tóm tắt ạ." }]);
        }
        continue;
      }

      let isDirectlyTargeted = false;
      let isImplicitlyTargeted = false;

      if (event.source.type === "user" || event.type === "postback") {
        isDirectlyTargeted = true;
      } else {
        const isMentioned = event.message?.mention?.mentionees?.some(m => m.isSelf === true);
        if (isMentioned) {
          isDirectlyTargeted = true;
        } else if (/\bannie\b/i.test(messageContent)) {
          isImplicitlyTargeted = true;
        }

        if (!isDirectlyTargeted && !isImplicitlyTargeted) {
          const profile = await line.getUserProfile(userId, sessionId);
          let senderName = profile?.displayName || "User";
          const userProfile = await getUserProfile(userId);
          if (userProfile && userProfile.real_name) {
            senderName = userProfile.real_name;
          }
          await appendRawMessage(sessionId, {
            role: "user",
            text: messageContent,
            senderName,
            senderId: userId,
            lineMessageId: eventMessageId,
            createdAt: new Date().toISOString()
          });
          continue;
        }
      }

      // Lấy tên hiển thị của người gửi
      const profileGroupId = event.source.groupId || event.source.roomId;
      const profile = await line.getUserProfile(userId, profileGroupId);
      let senderName = profile?.displayName || "User";
      const userProfile = await getUserProfile(userId);
      if (userProfile && userProfile.real_name) {
        senderName = userProfile.real_name;
      }

      // Lệnh reset bộ nhớ
      if (!isImage && cleanText(messageContent).toLowerCase() === "quên hết đi nào") {
        await clearSessionHistory(sessionId);
        await line.reply(event.replyToken, [{ type: "text", text: "Em mất trí nhớ rồi, huhu!" }]);
        continue;
      }

      // 1. Đăng ký active session và tải metadata từ RTDB
      await registerActiveSession(sessionId);
      const sessionData = await getSessionMetadata(sessionId);

      const sessionParticipants = sessionData.participants || {};
      const messagesArray = await getRawMessages(sessionId, 25);
      const hotTopic = sessionData.hotTopic || "";

      // Nếu người dùng reply (trích dẫn) một tin nhắn khác, tìm nội dung trong mảng history
      let cleanPrompt = messageContent;

      // Chặn Prompt Leakage offline để bảo vệ hệ thống & tiết kiệm 100% token/chi phí
      if (isPromptLeakAttempt(cleanPrompt)) {
        console.log(`[Prompt Protection] [LINE] Phát hiện gài bẫy prompt từ ${senderName}: "${cleanPrompt}"`);
        const secureReply = "Dạ, em không thể tiết lộ cấu hình hệ thống đâu nè! 🤫 Tụi mình trò chuyện chuyện khác vui hơn nha! Chúc anh/chị một ngày vui vẻ! ✨";
        const userMsgData = { role: "user", text: messageContent, senderName, senderId: userId, lineMessageId: eventMessageId, createdAt: new Date().toISOString() };
        const botMsgData = { role: "model", text: secureReply, createdAt: new Date().toISOString() };

        const lineMsg = { type: "text", text: secureReply };
        await line.reply(event.replyToken, [lineMsg]);
        await appendRawMessage(sessionId, userMsgData, botMsgData);
        continue;
      }

      let quoteContext = "";
      const quotedId = event.message?.quotedMessageId;
      if (quotedId) {
        try {
          const q = messagesArray.find(m => m.lineMessageId === quotedId);
          if (q) {
            if (q.mediaType === "image") {
              console.log(`[LINE] Quoted message là hình ảnh, đang tải on-demand và phân tích (ID: ${q.mediaId})...`);
              const imageBinary = await line.getImageBinary(q.mediaId);
              const imgDesc = await llm.multimodal(imageBinary);
              quoteContext = `[BỨC ẢNH ĐƯỢC TRÍCH DẪN]: "${imgDesc.trim()}"\n`;
            } else if (q.mediaType === "document") {
              console.log(`[LINE] Quoted message là tài liệu, đang tải on-demand và phân tích (ID: ${q.mediaId})...`);
              const localPath = await line.downloadMessageFile(q.mediaId, "quoted_doc");
              const fileDesc = await llm.analyzeDocument(localPath);
              quoteContext = `[TÀI LIỆU ĐƯỢC TRÍCH DẪN]: "${fileDesc.trim()}"\n`;
            } else {
              const quotedFrom = q.senderName || (q.role === "model" ? "Annie" : "ai đó");
              const fullText = q.text;
              quoteContext = `[Đang trả lời tin nhắn của ${quotedFrom}: "${fullText}"]\n`;
            }
          } else if (isDirectlyTargeted || isImplicitlyTargeted || isProactiveTargeted) {
            console.log(`[LINE] Quoted message không có trong history, thử tải on-demand file/ảnh (ID: ${quotedId})...`);
            try {
              const localPath = await line.downloadMessageFile(quotedId, "quoted_media");
              if (localPath) {
                const fileDesc = await llm.analyzeDocument(localPath);
                quoteContext = `[NỘI DUNG FILE/ẢNH ĐƯỢC TRÍCH DẪN]:\n"${fileDesc.trim()}"\n`;
              }
            } catch (downloadErr) {
              console.log(`[LINE] Quoted message không phải file/ảnh hoặc không thể truy cập. Gán fallback context.`);
              quoteContext = `[HỆ THỐNG BÁO LỖI: Người dùng đang reply một tin nhắn chữ được gửi trước khi bot vào group, bot không thể đọc được nội dung đó do giới hạn của LINE API. Hãy phản hồi người dùng là em không thể đọc được tin nhắn cũ này.]\n`;
            }
          }
        } catch (err) {
          console.error("[LINE] Lỗi tra cứu quoted message tổng quát:", err.message);
        }
      }

      // Cập nhật bản đồ tên → userId TOÀN CỤC cho LINE (với cache RAM)
      if (!cachedLineParticipants) {
        cachedLineParticipants = await getGlobalParticipants("line");
      }

      // Gộp và cập nhật tên người gửi mới
      const participants = { ...sessionParticipants, ...cachedLineParticipants };
      const lowerName = senderName.toLowerCase();

      let hasNewData = false;
      if (participants[lowerName] !== userId) {
        participants[lowerName] = userId;
        cachedLineParticipants[lowerName] = userId;
        hasNewData = true;
      }

      // Lưu bất đồng bộ sang global nếu có dữ liệu mới
      if (hasNewData) {
        await saveGlobalParticipants("line", cachedLineParticipants);
      }

      console.log(`[LINE] Participants map cho Session:`, JSON.stringify(participants));

      const forceIgnoreCheck = (!isDirectlyTargeted && isImplicitlyTargeted);
      const isGroup = event.source.type !== "user";
      const groupContext = await buildGroupProfileContext(participants, cleanPrompt, userId, isGroup, senderName);
      const factsContext = await findRelevantFacts(sessionId, cleanPrompt);
      const rawMsg = await llm.chat(sessionId, cleanPrompt, senderName, userId, eventMessageId, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext, factsContext);

      const userMsgData = { role: "user", text: messageContent, senderName, senderId: userId, lineMessageId: eventMessageId, createdAt: new Date().toISOString() };

      if (rawMsg.trim() === "IGNORE") {
        await appendRawMessage(sessionId, userMsgData);
        continue;
      }

      const { text: botMsgText, topic } = await processAndExtractProfile(rawMsg, userId, participants, sessionId, senderName, "LINE");

      if (topic) {
        await updateSessionMetadata(sessionId, { hotTopic: topic });
      }

      // Xây dựng LINE message có proper mention tags
      const lineMsg = buildLineMessage(botMsgText, participants, isGroup, topic || hotTopic);
      console.log(`[LINE] Payload gửi đi:`, JSON.stringify(lineMsg));

      const sentMessages = await line.reply(event.replyToken, [lineMsg]);

      const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
      if (sentMessages.length > 0) {
        botMsgData.lineMessageId = sentMessages[0].id;
      }

      await appendRawMessage(sessionId, userMsgData, botMsgData);

      continue;
    }

  }

  res.end();
});

// ─── SCHEDULED NOTIFICATIONS ──────────────────────────────────────────────────
const sendNotifications = async (type = "afternoon") => {
  const targetIdsStr = process.env.NOTIFICATION_TARGET_IDS || "";
  const targetIds = targetIdsStr.split(",").map(id => id.trim()).filter(Boolean);

  if (targetIds.length === 0) {
    console.log("[Schedule] Không có target ID nào được cấu hình. Bỏ qua.");
    return;
  }

  console.log(`[Schedule] Bắt đầu tạo bản tin ngày cho ${targetIds.length} mục tiêu (loại: ${type})...`);
  const newsDigest = await generateDailyNewsDigest(type);

  // Kiểm tra platform
  const isLine = !!process.env.CHANNEL_ACCESS_TOKEN;
  const isTelegram = !!process.env.TELEGRAM_BOT_TOKEN;

  for (const id of targetIds) {
    try {
      if (isLine) {
        await line.push(id, [{ type: "text", text: newsDigest.replace(/\*\*/g, "") }]);
        console.log(`[Schedule] Đã gửi bản tin cho LINE ID: ${id}`);
      } else if (isTelegram) {
        await telegram.push(id, newsDigest);
        console.log(`[Schedule] Đã gửi bản tin cho Telegram ID: ${id}`);
      }
    } catch (err) {
      console.error(`[Schedule] Lỗi khi gửi cho ID ${id}:`, err.message);
    }
  }
};

// ─── MASTER CRONJOB (ALL-IN-ONE) ──────────────────────────────────────────────
// Giảm thiểu tối đa số lượng Job trên Cloud Scheduler để đảm bảo chi phí 0đ
exports.masterScheduler = onSchedule({
  schedule: "*/5 * * * *", // Chạy mỗi 5 phút

  timeZone: "Asia/Ho_Chi_Minh",
  timeoutSeconds: 300,
  memory: "512MiB"
}, async (event) => {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const hour = vnTime.getHours();
  const minute = vnTime.getMinutes();
  const dayOfWeek = vnTime.getDay(); // 0 is Sunday, 1 is Monday ... 5 is Friday
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  // 1. Bản tin Sáng: 8:00 (Thứ 2 - Thứ 6)
  if (isWeekday && hour === 8 && minute < 5) {
    console.log("[Scheduler] Kích hoạt Bản tin Sáng");
    await sendNotifications("morning");
  }

  // 2. Bản tin Chiều: 13:30 (Thứ 2 - Thứ 6)
  if (isWeekday && hour === 13 && minute >= 30 && minute < 35) {
    console.log("[Scheduler] Kích hoạt Bản tin Chiều");
    await sendNotifications("afternoon");
  }

  // 3. Dọn dẹp Lịch sử (Memory Compression): Chạy mỗi 4 tiếng (0, 4, 8, 12, 16, 20) lúc đầu giờ
  if (hour % 4 === 0 && minute < 5) {
    console.log("[Scheduler] Kích hoạt Dọn dẹp Ký Ức (Mỗi 4 tiếng)");
    try {
      const activeSessions = await getActiveSessions();
      let cleanedCount = 0;
      const batch = db.batch();
      const fortyEightHoursAgo = Date.now() - 48 * 60 * 60 * 1000;

      for (const sessionId of activeSessions) {
        const sessionRef = db.collection("users").doc(sessionId);
        const sessionDoc = await sessionRef.get();
        const sessionData = sessionDoc.exists ? sessionDoc.data() : {};
        let needsUpdate = false;
        let updateData = {};

        if (sessionData.messages !== undefined) {
          updateData.messages = FieldValue.delete();
          needsUpdate = true;
        }

        let summaries = sessionData.summaries || [];
        const oldSummariesLength = summaries.length;
        summaries = summaries.filter(s => new Date(s.createdAt).getTime() >= fortyEightHoursAgo);
        if (summaries.length !== oldSummariesLength) {
          updateData.summaries = summaries;
          needsUpdate = true;
        }

        const rawMessages = await getRawMessages(sessionId);

        if (!rawMessages || rawMessages.length === 0) {
          await deregisterActiveSession(sessionId);
          continue;
        }

        console.log(`[Cleanup] Đang tóm tắt ${rawMessages.length} tin nhắn thô cho session: ${sessionId}`);
        const summaryText = await llm.summarizeHistory(rawMessages, sessionId);

        if (summaryText) {
          summaries.push({
            text: summaryText,
            createdAt: new Date().toISOString()
          });
          updateData.summaries = summaries;

          await clearRawMessages(sessionId);
          await rtdb.ref(`chats/${sessionId}/metadata/last_links`).remove().catch(() => { });
          await deregisterActiveSession(sessionId);
          needsUpdate = true;
        }

        if (needsUpdate && Object.keys(updateData).length > 0) {
          batch.set(sessionRef, updateData, { merge: true });
          cleanedCount++;
        }

        await new Promise(r => setTimeout(r, 4000));
      }

      if (cleanedCount > 0) {
        await batch.commit();
      }

      console.log(`[Cleanup] Đã nén và dọn dẹp lịch sử thành công cho ${cleanedCount} sessions.`);
    } catch (error) {
      console.error("[Cleanup] Lỗi khi Nén Ký Ức:", error);
    }
  }

  // 4. Xử lý Lịch hẹn (Smart Scheduler) tới hạn
  try {
    const dueSchedules = await getDueSchedules(Date.now());
    for (const schedule of dueSchedules) {
      console.log(`[Scheduler] Đang xử lý lịch hẹn: ${schedule.id} cho user ${schedule.userId}`);

      const prompt = `Đây là lịch hẹn đến hạn cần thực hiện. Nội dung yêu cầu của người dùng là: "${schedule.prompt}". Hãy hoàn thành nội dung này (ví dụ như tạo câu chúc, tóm tắt, báo cáo...) thật tự nhiên và đáng yêu, nhắn trực tiếp cho người dùng. TUYỆT ĐỐI KHÔNG lặp lại câu hỏi. KHÔNG sinh ra thẻ <SCHEDULE>.`;

      const payload = {
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        messages: [
          { role: "system", content: "Role: Annie. Xưng 'em', gọi 'anh/chị'. Bạn đang đóng vai trò trợ lý tự động gửi kết quả lịch hẹn/nhắc nhở cho người dùng. Trả lời ngay vào kết quả, tự nhiên, vui vẻ." },
          { role: "user", content: prompt }
        ]
      };

      const axios = require("axios");
      const response = await axios.post("https://api.deepseek.com/chat/completions", payload, {
        headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" }
      });
      const botResponse = response.data.choices[0].message.content.trim();
      const finalMsg = `🔔 Bíp bíp! Đến giờ hẹn của anh/chị rồi nha:\n\n${botResponse}`;

      if (schedule.platform === "Telegram") {
        await telegram.push(schedule.userId, finalMsg);
      } else {
        await line.push(schedule.userId, [{ type: "text", text: finalMsg }]);
      }

      // Xóa hoặc Update chu kỳ
      const typeStr = String(schedule.type).toUpperCase();
      if (typeStr === "ONCE") {
        await deleteSchedule(schedule.id);
      } else {
        let newTime = schedule.nextRun;
        if (typeStr === "DAILY") newTime += 86400000;
        else if (typeStr === "WEEKLY") newTime += 7 * 86400000;

        if (newTime === schedule.nextRun) {
          // Fallback: If time didn't change (e.g. invalid type), delete to avoid infinite loop
          await deleteSchedule(schedule.id);
          console.log(`[Scheduler] Đã xóa lịch ${schedule.id} do loại chu kỳ không hợp lệ: ${schedule.type}`);
        } else {
          await saveSchedule({ ...schedule, nextRun: newTime });
          console.log(`[Scheduler] Đã update lịch ${schedule.id} sang chu kỳ tiếp theo: ${new Date(newTime).toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" })}`);
        }
      }
    }
  } catch (error) {
    console.error("[Scheduler] Lỗi xử lý lịch hẹn tới hạn:", error.message);
  }
});

// Export helpers for testing/script purposes
exports.findRelevantFacts = findRelevantFacts;
exports.processAndExtractProfile = processAndExtractProfile;