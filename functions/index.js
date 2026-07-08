const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, FieldValue, pruneHistory, getUserProfile, saveUserProfile } = require("./utils/db");
const line = require("./utils/line");
const telegram = require("./utils/telegram");

const llm = require("./utils/llm");
const { generateDailyNewsDigest } = require("./utils/news");

let cachedTgParticipants = null;
let cachedLineParticipants = null;
const userProfileCache = new Map();

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
  "6753566898"
];

const ALLOWED_MESSENGER_USERS = [
  "*" // Tạm thời public hoặc điền PSID cụ thể
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const isUserAllowed = (userId, platform) => {
  let list;
  if (platform === "TELEGRAM") list = ALLOWED_TELEGRAM_USERS;

  else list = ALLOWED_LINE_USERS;
  return list.includes("*") || list.includes(userId);
};
const buildGroupProfileContext = async (participantsMap, promptText = "", senderId = "", isGroup = false) => {
  let ctx = "";
  const uniqueIds = [...new Set(Object.values(participantsMap))];
  const lowerPrompt = promptText.toLowerCase();

  for (const uid of uniqueIds) {
    if (!uid) continue;
    
    const name = Object.keys(participantsMap).find(k => participantsMap[k] === uid) || uid;
    
    // Thuật toán Smart Injection: Chỉ đưa Profile vào LLM nếu:
    // 1. Là người đang trực tiếp chat (senderId)
    // 2. Tên của họ được nhắc đến trong câu chat hoặc trong tin nhắn được Quote
    const isSender = (uid === senderId);
    const isMentioned = lowerPrompt.includes(name.toLowerCase());
    
    if (!isSender && !isMentioned) continue;

    let profile = userProfileCache.get(uid);
    if (!profile) {
      profile = await getUserProfile(uid);
      if (profile) userProfileCache.set(uid, profile);
    }
    
    if (profile) {
      const p = [];
      if (profile.gender) p.push(`Giới tính: ${profile.gender}`);
      if (profile.public_traits) p.push(`Đặc điểm chung: ${profile.public_traits}`);
      if (!isGroup && profile.private_traits) p.push(`Thông tin riêng tư: ${profile.private_traits}`);
      
      // Fallback for old data format
      if (profile.traits) p.push(`Đặc tính: ${profile.traits}`);
      
      if (p.length > 0) {
        ctx += `[${name}: ${p.join(", ")}] `;
      }
    }
  }
  return ctx ? `\n\nThông tin tập thể: ${ctx.trim()}` : "";
};

const processAndExtractProfile = (text, senderId) => {
  let cleanedText = text;
  const regex = /<PROFILE(?: userId="([^"]*)")?(?: gender="([^"]*)")?(?: public_traits="([^"]*)")?(?: private_traits="([^"]*)")?[^>]*>/gi;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const uid = match[1] || senderId; 
    const gender = match[2];
    const public_traits = match[3];
    const private_traits = match[4];
    
    if (gender || public_traits || private_traits) {
      const existing = userProfileCache.get(uid) || {};
      const updateData = {};
      
      if (gender) updateData.gender = gender;
      
      if (public_traits) {
        updateData.public_traits = existing.public_traits ? existing.public_traits + ", " + public_traits : public_traits;
      }
      if (private_traits) {
        updateData.private_traits = existing.private_traits ? existing.private_traits + ", " + private_traits : private_traits;
      }
      
      saveUserProfile(uid, updateData); 
      userProfileCache.set(uid, { ...existing, ...updateData });
    }
  }
  
  return cleanedText.replace(/<PROFILE[^>]*>/gi, "").trim();
};

/**
 * Xóa toàn bộ lịch sử chat của một session.
 * @param {string} sessionId
 */
const clearSessionHistory = async (sessionId) => {
  try {
    const chatRef = db.collection("users").doc(sessionId).collection("history");
    const snapshot = await chatRef.get();
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[Firestore] Đã xóa lịch sử chat: ${sessionId}`);
  } catch (error) {
    console.error(`[Firestore] Lỗi xóa lịch sử chat ${sessionId}:`, error.message);
  }
};

const cleanText = (text) => text.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

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
const buildLineMessage = (text, participants, isGroup = true) => {
  let cleanedText = text.replace(/\*\*/g, ""); // Strip markdown bold

  // LINE API không hỗ trợ mentions trong chat 1-1, trả về text thường
  if (!isGroup) {
    return {
      type: "text",
      text: cleanedText
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
      substitution: substitution
    };
  }

  // Nếu không có mention, trả về dạng text thường để tối ưu
  return {
    type: "text",
    text: cleanedText
  };
};

// ─── WEBHOOK ─────────────────────────────────────────────────────────────────

exports.webhook = onRequest(async (req, res) => {
  const platform = (process.env.PLATFORM || "LINE").toUpperCase();

  if (req.method === "GET") {
    return res.status(200).send("OK GET");
  }

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ── TELEGRAM ──────────────────────────────────────────────────────────────
  if (platform === "TELEGRAM") {
    const { message } = req.body;
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

    // Xử lý tin nhắn văn bản
    if (message.text) {
      const text = message.text;

      let isDirectlyTargeted = false;
      let isImplicitlyTargeted = false;

      if (chatType === "private") {
        isDirectlyTargeted = true;
      } else {
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
        if (botUsername && text.includes(`@${botUsername}`)) {
          isDirectlyTargeted = true;
        } else if (message.reply_to_message?.from?.username === botUsername) {
          isDirectlyTargeted = true;
        } else if (/\bannie\b/i.test(text)) {
          isImplicitlyTargeted = true;
        }

        if (!isDirectlyTargeted && !isImplicitlyTargeted) {
          // Lưu background history và thoát
          const userMsg = { role: "user", text, senderId: userId, createdAt: new Date().toISOString() };
          db.collection("users").doc(String(chatId)).set({ messages: FieldValue.arrayUnion(userMsg) }, { merge: true }).catch(e => console.error("Lưu bg lỗi:", e.message));
          return res.end();
        }
      }

      // Lệnh reset bộ nhớ
      if (cleanText(text).toLowerCase() === "quên hết đi nào") {
        await clearSessionHistory(String(chatId));
        await telegram.reply(chatId, "Em mất trí nhớ rồi, huhu!");
        return res.end();
      }

      const senderName = message.from.first_name || message.from.username || "User";

      // Lấy participants lịch sử của session này (nếu có) làm fallback
      const sessionRef = db.collection("users").doc(String(chatId));
      const sessionDoc = await sessionRef.get();
      const sessionParticipants = sessionDoc.data()?.participants || {};

      // Cập nhật bản đồ tên → userId (participants) TOÀN CỤC cho Telegram (với cache RAM)
      if (!cachedTgParticipants) {
        const globalRef = db.collection("metadata").doc("tg_participants");
        const globalDoc = await globalRef.get();
        cachedTgParticipants = globalDoc.data() || {};
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
        db.collection("metadata").doc("tg_participants").set(cachedTgParticipants, { merge: true }).catch(e => console.error("[Telegram] Lưu participants lỗi:", e.message));
      }

      // Nếu người dùng reply (trích dẫn) một tin nhắn khác, đính kèm nội dung đó vào prompt
      let cleanPrompt = text;
      let quoteContext = "";
      if (message.reply_to_message) {
        const replied = message.reply_to_message;
        const repliedFrom = replied.from?.first_name || replied.from?.username || "ai đó";
        const repliedText = replied.text || replied.caption || "";
        if (repliedText) {
          quoteContext = `[Đang trả lời tin nhắn của ${repliedFrom}: "${repliedText}"]\n`;
        }
      }

      const forceIgnoreCheck = (!isDirectlyTargeted && isImplicitlyTargeted);
      const isGroup = chatType !== "private";
      const groupContext = await buildGroupProfileContext(participants, cleanPrompt, userId, isGroup);
      const rawMsg = await llm.chat(String(chatId), cleanPrompt, senderName, userId, null, quoteContext, forceIgnoreCheck, groupContext);
      
      const userMsgData = { role: "user", text, senderName, senderId: userId, createdAt: new Date().toISOString() };
      
      if (rawMsg.trim() === "IGNORE") {
        db.collection("users").doc(String(chatId)).set({ messages: FieldValue.arrayUnion(userMsgData) }, { merge: true });
        return res.end();
      }

      const botMsgText = processAndExtractProfile(rawMsg, userId);

      // Convert @name → Telegram HTML mention thực sự
      const msg = convertTelegramMentions(botMsgText, participants);
      await telegram.reply(chatId, msg);
      
      const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
      db.collection("users").doc(String(chatId)).set({ messages: FieldValue.arrayUnion(userMsgData, botMsgData) }, { merge: true });

      return res.end();
    }

    // Xử lý ảnh (chỉ trong chat 1-1)
    if (message.photo && chatType === "private") {
      const fileId = message.photo[message.photo.length - 1].file_id;
      const imageBinary = await telegram.getImageBinary(fileId);
      const msg = await llm.multimodal(imageBinary);
      await telegram.reply(chatId, msg);
      return res.end();
    }

    return res.end();
  }

  // ── LINE ──────────────────────────────────────────────────────────────────
  const { events } = req.body;
  if (!events) return res.end();

  for (const event of events) {
    if (event.source?.userId) {
      console.log(`[LINE] User: ${event.source.userId} | Type: ${event.source.type}`);
    }

    if (event.type !== "message") continue;

    const userId = event.source.userId;
    const type = event.source.type; // "user", "group", "room"
    const groupId = event.source.groupId || event.source.roomId || "none";

    console.log(`[LINE] User: ${userId} | Type: ${type} | GroupID: ${groupId}`);

    // Kiểm tra whitelist
    if (!isUserAllowed(userId, "LINE")) {
      console.log(`[LINE] Từ chối User ${userId}`);
      continue;
    }

    // ── Tin nhắn văn bản
    if (event.message.type === "text") {
      let isDirectlyTargeted = false;
      let isImplicitlyTargeted = false;

      if (event.source.type === "user") {
        isDirectlyTargeted = true;
      } else {
        const isMentioned = event.message.mention?.mentionees?.some(m => m.isSelf === true);
        if (isMentioned) {
          isDirectlyTargeted = true;
        } else if (/\bannie\b/i.test(event.message.text)) {
          isImplicitlyTargeted = true;
        }

        if (!isDirectlyTargeted && !isImplicitlyTargeted) {
          const groupSessionId = event.source.groupId || event.source.roomId;
          db.collection("users").doc(groupSessionId).set({
            messages: FieldValue.arrayUnion({
              role: "user",
              text: event.message.text,
              senderId: userId,
              lineMessageId: event.message.id,
              createdAt: new Date().toISOString()
            })
          }, { merge: true }).catch(e => console.error("[LINE] Lỗi lưu group message:", e.message));
          continue; 
        }
      }

      const sessionId = event.source.groupId || event.source.roomId || userId;

      // Lấy tên hiển thị của người gửi
      const groupId = event.source.groupId || event.source.roomId;
      const profile = await line.getUserProfile(userId, groupId);
      const senderName = profile?.displayName || "User";

      // Lệnh reset bộ nhớ
      if (cleanText(event.message.text).toLowerCase() === "quên hết đi nào") {
        await clearSessionHistory(sessionId);
        await line.reply(event.replyToken, [{ type: "text", text: "Em mất trí nhớ rồi, huhu!" }]);
        continue;
      }

      // 1. Tải toàn bộ dữ liệu session (participants và messages) 1 lần duy nhất
      const sessionRef = db.collection("users").doc(sessionId);
      const sessionDoc = await sessionRef.get();
      const sessionData = sessionDoc.data() || {};
      
      const sessionParticipants = sessionData.participants || {};
      const messagesArray = sessionData.messages || [];

      // Nếu người dùng reply (trích dẫn) một tin nhắn khác, tìm nội dung trong mảng history
      let cleanPrompt = event.message.text;
      let quoteContext = "";
      const quotedId = event.message.quotedMessageId;
      if (quotedId) {
        try {
          const q = messagesArray.find(m => m.lineMessageId === quotedId);
          if (q) {
            const quotedFrom = q.senderName || (q.role === "model" ? "Annie" : "ai đó");
            const fullText = q.text;
            quoteContext = `[Đang trả lời tin nhắn của ${quotedFrom}: "${fullText}"]\n`;
          }
        } catch (err) {
          console.error("[LINE] Lỗi tra cứu quoted message:", err.message);
        }
      }

      // Cập nhật bản đồ tên → userId TOÀN CỤC cho LINE (với cache RAM)
      if (!cachedLineParticipants) {
        const globalRef = db.collection("metadata").doc("line_participants");
        const globalDoc = await globalRef.get();
        cachedLineParticipants = globalDoc.data() || {};
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
        db.collection("metadata").doc("line_participants").set(cachedLineParticipants, { merge: true }).catch(e => console.error("[LINE] Lưu participants lỗi:", e.message));
      }

      console.log(`[LINE] Participants map cho Session:`, JSON.stringify(participants));

      const forceIgnoreCheck = (!isDirectlyTargeted && isImplicitlyTargeted);
      const isGroup = event.source.type !== "user";
      const groupContext = await buildGroupProfileContext(participants, cleanPrompt, userId, isGroup);
      const rawMsg = await llm.chat(sessionId, cleanPrompt, senderName, userId, event.message.id, quoteContext, forceIgnoreCheck, groupContext);

      const userMsgData = { role: "user", text: event.message.text, senderName, senderId: userId, lineMessageId: event.message.id, createdAt: new Date().toISOString() };
      
      if (rawMsg.trim() === "IGNORE") {
        db.collection("users").doc(sessionId).set({ messages: FieldValue.arrayUnion(userMsgData) }, { merge: true });
        continue;
      }

      const botMsgText = processAndExtractProfile(rawMsg, userId);

      // Xây dựng LINE message có proper mention tags
      const lineMsg = buildLineMessage(botMsgText, participants, isGroup);
      console.log(`[LINE] Payload gửi đi:`, JSON.stringify(lineMsg));

      const sentMessages = await line.reply(event.replyToken, [lineMsg]);

      const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
      if (sentMessages.length > 0) {
        botMsgData.lineMessageId = sentMessages[0].id;
      }
      
      db.collection("users").doc(sessionId).set({ messages: FieldValue.arrayUnion(userMsgData, botMsgData) }, { merge: true }).catch(e => console.error("[LINE] DB save error:", e.message));

      continue;
    }

    // ── Tin nhắn ảnh (chỉ trong chat 1-1)
    if (event.message.type === "image" && event.source.type === "user") {
      const imageBinary = await line.getImageBinary(event.message.id);
      const msg = await llm.multimodal(imageBinary);
      await line.reply(event.replyToken, [{ type: "text", text: msg.replace(/\*\*/g, "") }]);
    }
  }

  res.end();
});

// ─── SCHEDULED NOTIFICATIONS ──────────────────────────────────────────────────
const sendNotifications = async () => {
  const targetIdsStr = process.env.NOTIFICATION_TARGET_IDS || "";
  const targetIds = targetIdsStr.split(",").map(id => id.trim()).filter(Boolean);
  
  if (targetIds.length === 0) {
    console.log("[Schedule] Không có target ID nào được cấu hình. Bỏ qua.");
    return;
  }

  console.log(`[Schedule] Bắt đầu tạo bản tin ngày cho ${targetIds.length} mục tiêu...`);
  const newsDigest = await generateDailyNewsDigest();

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

exports.morningNewsNotification = onSchedule({
  schedule: "0 8 * * 1-5",
  timeZone: "Asia/Ho_Chi_Minh",
  timeoutSeconds: 300,
  memory: "512MiB"
}, async (event) => {
  await sendNotifications();
});

exports.afternoonNewsNotification = onSchedule({
  schedule: "30 13 * * 1-5",
  timeZone: "Asia/Ho_Chi_Minh",
  timeoutSeconds: 300,
  memory: "512MiB"
}, async (event) => {
  await sendNotifications();
});

// ─── HISTORY CLEANUP CRONJOB ──────────────────────────────────────────────────
exports.dailyHistoryCleanup = onSchedule({
  schedule: "0 * * * *", // Chạy mỗi giờ (1h00, 2h00...)
  timeZone: "Asia/Ho_Chi_Minh",
  timeoutSeconds: 300,
  memory: "256MiB"
}, async (event) => {
  console.log("[Cleanup] Bắt đầu dọn dẹp mảng lịch sử (giữ 4 giờ qua, max 1000 tin)...");
  try {
    const usersSnap = await db.collection("users").get();
    let cleanedCount = 0;
    
    // Sử dụng batch để tối ưu số lần commit
    const batch = db.batch();
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    
    usersSnap.forEach(doc => {
      const data = doc.data();
      if (data && data.messages && data.messages.length > 0) {
        let needsUpdate = false;
        
        // 1. Lọc bỏ tin cũ hơn 4 giờ
        let recentMessages = data.messages.filter(msg => {
          if (!msg.createdAt) return true;
          return new Date(msg.createdAt) >= fourHoursAgo;
        });

        if (recentMessages.length !== data.messages.length) {
          needsUpdate = true;
        }

        // 2. Chặn trần 1000 tin nhắn
        if (recentMessages.length > 1000) {
          recentMessages = recentMessages.slice(-1000);
          needsUpdate = true;
        }

        if (needsUpdate) {
          batch.update(doc.ref, { messages: recentMessages });
          cleanedCount++;
        }
      }
    });

    if (cleanedCount > 0) {
      await batch.commit();
    }
    
    console.log(`[Cleanup] Đã dọn dẹp lịch sử thành công cho ${cleanedCount} sessions.`);
  } catch (error) {
    console.error("[Cleanup] Lỗi khi dọn dẹp lịch sử:", error);
  }
});