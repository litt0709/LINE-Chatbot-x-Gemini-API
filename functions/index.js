const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, FieldValue, pruneHistory } = require("./utils/db");
const line = require("./utils/line");
const telegram = require("./utils/telegram");

const llm = require("./utils/llm");
const { generateDailyNewsDigest } = require("./utils/news");

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

      // Trong group, chỉ trả lời khi được @tag
      if (chatType !== "private") {
        const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
        if (!botUsername || !text.includes(`@${botUsername}`)) return res.end();
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

      // Lưu và cập nhật bản đồ tên → userId (participants) TOÀN CỤC cho Telegram
      const globalRef = db.collection("metadata").doc("tg_participants");
      const globalDoc = await globalRef.get();
      const globalParticipants = globalDoc.data() || {};

      // Gộp và cập nhật tên người gửi mới
      const participants = { ...sessionParticipants, ...globalParticipants };
      participants[senderName.toLowerCase()] = userId;
      if (message.from.username) participants[message.from.username.toLowerCase()] = userId;

      // Lưu bất đồng bộ sang global
      globalRef.set(participants, { merge: true }).catch(e => console.error("[Telegram] Lưu participants lỗi:", e.message));

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

      const rawMsg = await llm.chat(String(chatId), cleanPrompt, senderName, userId, null, quoteContext);
      // Convert @name → Telegram HTML mention thực sự
      const msg = convertTelegramMentions(rawMsg, participants);
      await telegram.reply(chatId, msg);
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
      // Trong group/room: Lưu tin nhắn vào Firestore để hỗ trợ reply/quote sau này
      if (event.source.type !== "user") {
        const isMentioned = event.message.mention?.mentionees?.some(m => m.isSelf === true);
        if (!isMentioned) {
          const groupSessionId = event.source.groupId || event.source.roomId;
          // Chỉ lưu tin nhắn nhẹ nếu bot KHÔNG được đề cập (để phục vụ lookup sau này)
          db.collection("users").doc(groupSessionId).collection("history").doc().set({
            role: "user",
            text: event.message.text,
            senderId: userId,
            lineMessageId: event.message.id,
            createdAt: FieldValue.serverTimestamp()
          }).then(() => {
            // Dọn dẹp bất đồng bộ, giữ lịch sử 50 tin nhắn gần nhất
            pruneHistory(groupSessionId, 50);
          }).catch(e => console.error("[LINE] Lỗi lưu group message:", e.message));
          continue; // Bot không được tag → dừng xử lý, không gọi LLM
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

      // Nếu người dùng reply (trích dẫn) một tin nhắn khác, tìm nội dung trong lịch sử Firestore
      let cleanPrompt = event.message.text;
      let quoteContext = "";
      const quotedId = event.message.quotedMessageId;
      if (quotedId) {
        try {
          const chatRef = db.collection("users").doc(sessionId).collection("history");
          const quotedSnap = await chatRef.where("lineMessageId", "==", quotedId).limit(1).get();
          if (!quotedSnap.empty) {
            const q = quotedSnap.docs[0].data();
            const quotedFrom = q.senderName || (q.role === "model" ? "Annie" : "ai đó");
            const fullText = q.text;
            quoteContext = `[Đang trả lời tin nhắn của ${quotedFrom}: "${fullText}"]\n`;
          }
        } catch (err) {
          console.error("[LINE] Lỗi tra cứu quoted message:", err.message);
        }
      }

      // Lấy participants lịch sử của session này (nếu có) làm fallback
      const sessionRef = db.collection("users").doc(sessionId);
      const sessionDoc = await sessionRef.get();
      const sessionParticipants = sessionDoc.data()?.participants || {};

      // Lưu và cập nhật bản đồ tên → userId TOÀN CỤC cho LINE (chỉ lưu tên đầy đủ)
      const globalRef = db.collection("metadata").doc("line_participants");
      const globalDoc = await globalRef.get();
      const globalParticipants = globalDoc.data() || {};

      // Gộp và cập nhật tên người gửi mới
      const participants = { ...sessionParticipants, ...globalParticipants };
      participants[senderName.toLowerCase()] = userId;

      // Lưu bất đồng bộ sang global
      globalRef.set(participants, { merge: true }).catch(e => console.error("[LINE] Lưu participants lỗi:", e.message));

      console.log(`[LINE] Participants map cho Session:`, JSON.stringify(participants));

      const rawMsg = await llm.chat(sessionId, cleanPrompt, senderName, userId, event.message.id, quoteContext);

      // Xây dựng LINE message có proper mention tags
      const isGroup = event.source.type !== "user";
      const lineMsg = buildLineMessage(rawMsg, participants, isGroup);
      console.log(`[LINE] Payload gửi đi:`, JSON.stringify(lineMsg));

      const sentMessages = await line.reply(event.replyToken, [lineMsg]);

      // Lưu LINE message ID của tin nhắn bot vào Firestore để hỗ trợ reply/quote sau này
      if (sentMessages.length > 0) {
        const chatRef = db.collection("users").doc(sessionId).collection("history");
        const botMsgSnap = await chatRef.orderBy("createdAt", "desc").limit(1).get();
        if (!botMsgSnap.empty && botMsgSnap.docs[0].data().role === "model") {
          botMsgSnap.docs[0].ref.update({ lineMessageId: sentMessages[0].id }).catch(e =>
            console.error("[LINE] Lưu bot lineMessageId lỗi:", e.message)
          );
        }

      }
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