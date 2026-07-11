const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const crypto = require("crypto");
const { db, rtdb, FieldValue, appendRawMessage, getRawMessages, clearRawMessages, getUserProfile, saveUserProfile, registerActiveSession, getActiveSessions, deregisterActiveSession, getSessionMetadata, updateSessionMetadata, getGlobalParticipants, saveGlobalParticipants } = require("./utils/db");
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
  const uniqueIds = [...new Set(Object.values(participantsMap))].filter(Boolean);
  const lowerPrompt = promptText.toLowerCase();

  // Lấy profile song song bằng Promise.all (nhanh hơn ~50% so với for...of tuần tự)
  const results = await Promise.all(uniqueIds.map(async (uid) => {
    const name = Object.keys(participantsMap).find(k => participantsMap[k] === uid) || uid;
    const isSender = (uid === senderId);
    const isMentioned = lowerPrompt.includes(name.toLowerCase());
    if (!isSender && !isMentioned) return null;

    let profile = userProfileCache.get(uid);
    if (!profile) {
      profile = await getUserProfile(uid);
      if (profile) userProfileCache.set(uid, profile);
    }
    if (!profile) return null;

    const p = [];
    if (profile.gender) p.push(`Giới tính: ${profile.gender}`);
    if (profile.public_traits) p.push(`Đặc điểm chung: ${profile.public_traits}`);
    if (!isGroup && profile.private_traits) p.push(`Thông tin riêng tư: ${profile.private_traits}`);
    if (profile.traits) p.push(`Đặc tính: ${profile.traits}`);
    return p.length > 0 ? `[${name}: ${p.join(", ")}] ` : null;
  }));

  const ctx = results.filter(Boolean).join("");
  return ctx ? `\n\nThông tin tập thể: ${ctx.trim()}` : "";
};

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

const processAndExtractProfile = (text, senderId, participants = {}) => {
  let cleanedText = text;

  let topic = null;
  const topicMatch = cleanedText.match(/<TOPIC>(.*?)<\/TOPIC>/i);
  if (topicMatch) {
    topic = topicMatch[1].trim();
    console.log(`[Auto-Topic Sync] Phát hiện chủ đề mới: ${topic}`);
    cleanedText = cleanedText.replace(/<TOPIC>.*?<\/TOPIC>/gi, "");
  }

  const regex = /<PROFILE(?: userId="([^"]*)")?(?: real_name="([^"]*)")?(?: gender="([^"]*)")?(?: public_traits="([^"]*)")?(?: private_traits="([^"]*)")?[^>]*>/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    let uid = match[1] || senderId;

    if (match[1]) {
      const lowerUid = removeAccents(match[1].trim().toLowerCase());
      if (participants[lowerUid]) {
        uid = participants[lowerUid];
        console.log(`[Profile] Phân giải tên "${match[1]}" thành ID thực: ${uid}`);
      } else {
        console.log(`[Profile] Không tìm thấy ID thực cho "${match[1]}", dùng tạm làm ID.`);
      }
    }

    const real_name = match[2];
    const gender = match[3];
    const public_traits = match[4];
    const private_traits = match[5];

    if (real_name || gender || public_traits || private_traits) {
      const existing = userProfileCache.get(uid) || {};
      const updateData = {};

      if (real_name) updateData.real_name = real_name;
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

  cleanedText = cleanedText.replace(/<PROFILE[^>]*>|<\/PROFILE>/gi, "").replace(/\n{3,}/g, "\n\n").trim();
  return { text: cleanedText, topic };
};

/**
 * Xóa toàn bộ lịch sử chat của một session.
 * @param {string} sessionId
 */
const clearSessionHistory = async (sessionId) => {
  try {
    // 1. Xóa Firestore History
    const chatRef = db.collection("users").doc(sessionId).collection("history");
    const snapshot = await chatRef.get();
    const batch = db.batch();
    snapshot.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`[Firestore] Đã xóa lịch sử chat: ${sessionId}`);

    // 2. Xóa RTDB Raw Messages
    await clearRawMessages(sessionId);
    console.log(`[RTDB] Đã xóa tin nhắn thô: ${sessionId}`);

    // 3. Xóa Metadata (participants, hotTopic) trên RTDB & Cache
    await updateSessionMetadata(sessionId, { participants: {}, hotTopic: "" });
    console.log(`[RTDB/Cache] Đã reset metadata: ${sessionId}`);
  } catch (error) {
    console.error(`[Reset Session] Lỗi xóa lịch sử chat ${sessionId}:`, error.message);
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

exports.webhook = onRequest(async (req, res) => {
  const platform = (process.env.PLATFORM || "LINE").toUpperCase();

  if (req.method === "GET") {
    return res.status(200).send("OK GET");
  }

  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  // ── TELEGRAM ──────────────────────────────────────────────────────────────
  if (platform === "TELEGRAM") {
    // [SECURITY] Xác thực Webhook của Telegram
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

    let isImage = false;

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
    let isDirectlyTargeted = chatType === "private" ||
      (messageContent && messageContent.includes(`@${botUsername}`)) ||
      (message.reply_to_message?.from?.username === botUsername);
    let isImplicitlyTargeted = !isDirectlyTargeted && messageContent && /\bannie\b/i.test(messageContent);

    const shouldProcessMedia = chatType === "private" || isDirectlyTargeted || isImplicitlyTargeted;
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
      if (!isDirectlyTargeted && !isImplicitlyTargeted) {
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
    const groupContext = await buildGroupProfileContext(participants, cleanPrompt, userId, isGroup);
    const rawMsg = await llm.chat(String(chatId), cleanPrompt, senderName, userId, null, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext);

    const userMsgData = { role: "user", text: messageContent, senderName, senderId: userId, createdAt: new Date().toISOString() };

    if (rawMsg.trim() === "IGNORE") {
      await appendRawMessage(String(chatId), userMsgData);
      return res.end();
    }

    const { text: botMsgText, topic } = processAndExtractProfile(rawMsg, userId, participants);

    if (topic) {
      await updateSessionMetadata(String(chatId), { hotTopic: topic });
    }

    // Convert @name → Telegram HTML mention thực sự
    const msg = convertTelegramMentions(botMsgText, participants);
    await telegram.reply(chatId, msg);

    const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
    await appendRawMessage(String(chatId), userMsgData, botMsgData);

    return res.end();

    return res.end();
  }

  // ── LINE ──────────────────────────────────────────────────────────────────
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
        } else if (isDirectlyTargeted || isImplicitlyTargeted) {
          console.log(`[LINE] Quoted message không có trong history, thử tải on-demand file/ảnh (ID: ${quotedId})...`);
          const localPath = await line.downloadMessageFile(quotedId, "quoted_media");
          if (localPath) {
            const fileDesc = await llm.analyzeDocument(localPath);
            quoteContext = `[NỘI DUNG FILE/ẢNH ĐƯỢC TRÍCH DẪN]:\n"${fileDesc.trim()}"\n`;
          }
        }
      } catch (err) {
        console.error("[LINE] Lỗi tra cứu quoted message:", err.message);
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
    const groupContext = await buildGroupProfileContext(participants, cleanPrompt, userId, isGroup);
    const rawMsg = await llm.chat(sessionId, cleanPrompt, senderName, userId, eventMessageId, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext);

    const userMsgData = { role: "user", text: messageContent, senderName, senderId: userId, lineMessageId: eventMessageId, createdAt: new Date().toISOString() };

    if (rawMsg.trim() === "IGNORE") {
      await appendRawMessage(sessionId, userMsgData);
      continue;
    }

    const { text: botMsgText, topic } = processAndExtractProfile(rawMsg, userId, participants);

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
  schedule: "0,30 * * * *", // Chạy mỗi 30 phút
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
  if (isWeekday && hour === 8 && minute < 30) {
    console.log("[Scheduler] Kích hoạt Bản tin Sáng");
    await sendNotifications("morning");
  }

  // 2. Bản tin Chiều: 13:30 (Thứ 2 - Thứ 6)
  if (isWeekday && hour === 13 && minute >= 30) {
    console.log("[Scheduler] Kích hoạt Bản tin Chiều");
    await sendNotifications("afternoon");
  }

  // 3. Dọn dẹp Lịch sử (Memory Compression): Chạy mỗi 4 tiếng (0, 4, 8, 12, 16, 20) lúc đầu giờ
  if (hour % 4 === 0 && minute < 30) {
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
});