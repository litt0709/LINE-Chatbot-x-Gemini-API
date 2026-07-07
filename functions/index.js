const { onRequest } = require("firebase-functions/v2/https");
const { db, FieldValue, pruneHistory } = require("./utils/db");
const line = require("./utils/line");
const telegram = require("./utils/telegram");
const llm = require("./utils/llm");

// ─── CẤU HÌNH WHITELIST ──────────────────────────────────────────────────────
// Đặt "*" để cho phép tất cả mọi người dùng bot.

const ALLOWED_LINE_USERS = [
  "U6cc1a9cfda8d2f79d0aae1778becfb65",
  "*" // Đặt "*" để cho phép tất cả
];

const ALLOWED_TELEGRAM_USERS = [
  "2140581850",
  "730806080",
  "1098066961"
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const isUserAllowed = (userId, platform) => {
  const list = platform === "TELEGRAM" ? ALLOWED_TELEGRAM_USERS : ALLOWED_LINE_USERS;
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

/**
 * Làm sạch text: xóa @mention và khoảng trắng thừa.
 * @param {string} text
 * @returns {string}
 */
const cleanText = (text) => text.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();

/**
 * Chuyển đổi các @tên trong câu trả lời của bot thành Telegram mention thực sự.
 * Dùng format HTML: <a href="tg://user?id=USER_ID">tên</a>
 * @param {string} text - Nội dung câu trả lời của LLM
 * @param {Object} participants - Map {tên_thường: userId}
 * @returns {string}
 */
const convertTelegramMentions = (text, participants) => {
  if (!Object.keys(participants).length) return text;
  return text.replace(/@(\S+)/g, (match, name) => {
    const id = participants[name.toLowerCase()];
    return id ? `<a href="tg://user?id=${id}">${name}</a>` : match;
  });
};

/**
 * Xây dựng message object LINE có mentions thực sự từ câu trả lời của bot.
 * LINE yêu cầu position (character index) của từng @tág trong chuỗi text.
 * @param {string} text - Nội dung câu trả lời của LLM
 * @param {Object} participants - Map {tên_thường: userId}
 * @returns {{ type: string, text: string, mention?: { mentions: object[] } }}
 */
const buildLineMessage = (text, participants) => {
  let cleanedText = text.replace(/\*\*/g, ""); // Strip markdown bold
  const mentionees = [];

  // Sắp xếp tên theo độ dài giảm dần để match tên dài trước (tránh match bộ phận)
  const sortedNames = Object.keys(participants).sort((a, b) => b.length - a.length);

  // Với mỗi tên participant, tìm các xuất hiện @Tên trong text và đánh dấu position
  for (const name of sortedNames) {
    const userId = participants[name];
    // Tìm cả @tên (case-insensitive), có thể nhiều từ có dấu cách
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`@${escapedName}`, "gi");
    let match;
    while ((match = pattern.exec(cleanedText)) !== null) {
      mentionees.push({
        index: match.index,
        length: match[0].length,
        type: "user",
        userId: userId
      });
    }
  }

  // Sắp xếp theo position để LINE nhận đúng thứ tự
  mentionees.sort((a, b) => a.index - b.index);

  const msg = { type: "text", text: cleanedText };
  // Đúng chuẩn LINE API: dùng property "mention", bên trong chứa array "mentions"
  if (mentionees.length > 0) {
    msg.mention = { mentions: mentionees };
  }
  return msg;
};

// ─── WEBHOOK ─────────────────────────────────────────────────────────────────

exports.webhook = onRequest(async (req, res) => {
  if (req.method !== "POST") return res.send(req.method);

  const platform = (process.env.PLATFORM || "LINE").toUpperCase();

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

      // Lưu và cập nhật bản đồ tên → userId (participants) cho session này
      const sessionRef = db.collection("users").doc(String(chatId));
      const sessionDoc = await sessionRef.get();
      const participants = sessionDoc.data()?.participants || {};
      participants[senderName.toLowerCase()] = userId;
      if (message.from.username) participants[message.from.username.toLowerCase()] = userId;
      // Lưu bất đồng bộ, không block response
      sessionRef.set({ participants }, { merge: true }).catch(e => console.error("[Telegram] Lưu participants lỗi:", e.message));

      // Nếu người dùng reply (trích dẫn) một tin nhắn khác, đính kèm nội dung đó vào prompt
      let promptText = text;
      if (message.reply_to_message) {
        const replied = message.reply_to_message;
        const repliedFrom = replied.from?.first_name || replied.from?.username || "ai đó";
        const repliedText = replied.text || replied.caption || "";
        if (repliedText) {
          promptText = `[Đang trả lời tin nhắn của ${repliedFrom}: "${repliedText}"]\n${text}`;
        }
      }

      const rawMsg = await llm.chat(String(chatId), promptText, senderName, userId);
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
      let promptText = event.message.text;
      const quotedId = event.message.quotedMessageId;
      if (quotedId) {
        try {
          const chatRef = db.collection("users").doc(sessionId).collection("history");
          const quotedSnap = await chatRef.where("lineMessageId", "==", quotedId).limit(1).get();
          if (!quotedSnap.empty) {
            const q = quotedSnap.docs[0].data();
            const quotedFrom = q.senderName || (q.role === "model" ? "Annie" : "ai đó");
            promptText = `[Đang trả lời tin nhắn của ${quotedFrom}: "${q.text}"]\n${event.message.text}`;
          }
        } catch (err) {
          console.error("[LINE] Lỗi tra cứu quoted message:", err.message);
        }
      }

      // Lưu và cập nhật bản đồ tên → userId cho session LINE (chỉ lưu tên đầy đủ)
      const sessionRef = db.collection("users").doc(sessionId);
      const sessionDoc = await sessionRef.get();
      const participants = sessionDoc.data()?.participants || {};
      participants[senderName.toLowerCase()] = userId;
      sessionRef.set({ participants }, { merge: true }).catch(e => console.error("[LINE] Lưu participants lỗi:", e.message));

      const rawMsg = await llm.chat(sessionId, promptText, senderName, userId, event.message.id);
      // Xây dựng LINE message có proper mention tags
      const lineMsg = buildLineMessage(rawMsg, participants);
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