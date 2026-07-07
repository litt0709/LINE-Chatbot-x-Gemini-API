const { onRequest } = require("firebase-functions/v2/https");
const { db } = require("./utils/db");
const line = require("./utils/line");
const telegram = require("./utils/telegram");
const llm = require("./utils/llm");

// ─── CẤU HÌNH WHITELIST ──────────────────────────────────────────────────────
// Đặt "*" để cho phép tất cả mọi người dùng bot.

const ALLOWED_LINE_USERS = [
  "*" // Cho phép tất cả người dùng LINE
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
      const msg = await llm.chat(String(chatId), text, senderName, userId);
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
      // Trong group/room, chỉ trả lời khi bot được @mention
      if (event.source.type !== "user") {
        const isMentioned = event.message.mention?.mentionees?.some(m => m.isSelf === true);
        if (!isMentioned) continue;
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

      const msg = await llm.chat(sessionId, event.message.text, senderName, userId);
      // LINE không hỗ trợ Markdown, strip ** trước khi gửi
      await line.reply(event.replyToken, [{ type: "text", text: msg.replace(/\*\*/g, "") }]);
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