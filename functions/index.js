const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const line = require("./utils/line");
const telegram = require("./utils/telegram");
const gemini = require("./utils/gemini");
const deepseek = require("./utils/deepseek");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

// Hàm xóa lịch sử trò chuyện của một session (phòng chat hoặc cuộc hội thoại 1-1)
const clearSessionHistory = async (sessionId) => {
  const chatRef = db.collection("users").doc(sessionId).collection("history");
  const snapshot = await chatRef.get();
  const batch = db.batch();
  snapshot.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log(`[Firestore] Đã xóa lịch sử chat của session: ${sessionId}`);
};

// CẤU HÌNH: Danh sách LINE User ID được phép sử dụng Bot (Đặt "*" để cho phép tất cả mọi người)
const ALLOWED_LINE_USERS = [
  "U6cc1a9cfda8d2f79d0aae1778becfb65",
  "*"
];

// CẤU HÌNH: Danh sách Telegram User ID được phép sử dụng Bot (Đặt "*" để cho phép tất cả mọi người)
const ALLOWED_TELEGRAM_USERS = [
  "2140581850",
  "730806080",
  "1098066961"
];

// Hàm kiểm tra xem người gửi có được phép tương tác không
const isUserAllowed = (userId, platform) => {
  const allowedList = platform === "TELEGRAM" ? ALLOWED_TELEGRAM_USERS : ALLOWED_LINE_USERS;
  return allowedList.includes("*") || allowedList.includes(userId);
};

exports.webhook = onRequest(async (req, res) => {
  if (req.method === "POST") {
    const platform = (process.env.PLATFORM || "LINE").toUpperCase();

    if (platform === "TELEGRAM") {
      const update = req.body;
      if (!update.message) {
        return res.end();
      }

      const message = update.message;
      const chatId = message.chat.id; // Session ID (ID nhóm chat hoặc ID chat 1-1)
      const userId = String(message.from.id); // ID người gửi (dạng chuỗi để kiểm tra whitelist)
      const chatType = message.chat.type; // "private", "group", "supergroup", "channel"

      console.log(`[Telegram Bot] Nhận tin nhắn từ User ID: ${userId} | Chat ID: ${chatId} | Kiểu chat: ${chatType}`);

      // 1. Kiểm tra xem người gửi có nằm trong danh sách được phép không
      if (!isUserAllowed(userId, "TELEGRAM")) {
        console.log(`[Telegram Bot] Từ chối vì User ID ${userId} không có trong whitelist.`);
        // Tự động thoát nếu bị thêm vào Group, Supergroup hoặc Channel trái phép
        if (chatType === "group" || chatType === "supergroup" || chatType === "channel") {
          console.log(`[Telegram Bot] Tự động thoát khỏi phòng chat trái phép: ${chatId}`);
          await telegram.leaveChat(chatId);
        }
        return res.end();
      }

      // 2. Xử lý tin nhắn dạng Text
      if (message.text) {
        const text = message.text;

        // Nếu ở trong Group/Supergroup, chỉ trả lời khi Bot được tag (@username)
        if (chatType === "group" || chatType === "supergroup") {
          const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
          const isMentioned = botUsername && text.includes(`@${botUsername}`);
          if (!isMentioned) {
            return res.end(); // Bỏ qua tin nhắn
          }
        }

        // Tự động xóa lịch sử hội thoại nếu người dùng gửi tin nhắn đặc biệt
        const cleanedText = text.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();
        if (cleanedText.toLowerCase() === "quên hết đi nào") {
          await clearSessionHistory(String(chatId));
          await telegram.reply(chatId, "Em mất trí nhớ rồi, huhu!");
          return res.end();
        }

        let msg;
        if (process.env.LLM_PROVIDER === "DEEPSEEK") {
          msg = await deepseek.chat(String(chatId), text);
        } else {
          msg = await gemini.chat(String(chatId), text);
        }
        await telegram.reply(chatId, msg);
        return res.end();
      }

      // 3. Xử lý tin nhắn dạng Ảnh
      if (message.photo) {
        // Chỉ xử lý ảnh trong chat 1-1 riêng tư
        if (chatType === "group" || chatType === "supergroup") {
          return res.end();
        }

        // Lấy ảnh có độ phân giải lớn nhất (nằm ở cuối mảng photo)
        const photo = message.photo[message.photo.length - 1];
        const fileId = photo.file_id;

        const imageBinary = await telegram.getImageBinary(fileId);
        const msg = await gemini.multimodal(imageBinary);
        await telegram.reply(chatId, msg);
        return res.end();
      }

      return res.end();
    } else {
      // Logic xử lý LINE Platform (Mặc định)
      const events = req.body.events;
      if (!events) return res.end();

      for (const event of events) {
        // Log ra console để bạn dễ dàng tìm thấy User ID của mình trong Firebase Logs / Emulator Logs
        if (event.source && event.source.userId) {
          console.log(`[LINE Bot] Nhận tin nhắn từ User ID: ${event.source.userId} | Kiểu chat: ${event.source.type}`);
        }

        switch (event.type) {
          case "message":

            if (event.message.type === "text") {
              const userId = event.source.userId;

              // 1. Kiểm tra xem người gửi có nằm trong danh sách được phép không
              if (!isUserAllowed(userId, "LINE")) {
                console.log(`[LINE Bot] Từ chối phản hồi vì User ID ${userId} không nằm trong whitelist.`);
                return res.end();
              }

              // 2. Nếu ở trong Group/Room, kiểm tra thêm điều kiện Bot được tag
              if (event.source.type === "group" || event.source.type === "room") {
                const isMentioned = event.message.mention?.mentionees?.some(m => m.isSelf === true);
                if (!isMentioned) {
                  return res.end(); // Bỏ qua tin nhắn nếu Bot không được tag
                }
              }

              // 3. Xác định sessionId: Dùng groupId/roomId cho nhóm chat, hoặc userId cho chat 1-1
              const sessionId = event.source.groupId || event.source.roomId || event.source.userId;

              // Tự động xóa lịch sử hội thoại nếu người dùng gửi tin nhắn đặc biệt
              const cleanedText = event.message.text.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();
              if (cleanedText.toLowerCase() === "quên hết đi nào") {
                await clearSessionHistory(sessionId);
                await line.reply(event.replyToken, [{ type: "text", text: "Em mất trí nhớ rồi, huhu!" }]);
                return res.end();
              }

              let msg;
              if (process.env.LLM_PROVIDER === "DEEPSEEK") {
                msg = await deepseek.chat(sessionId, event.message.text);
              } else {
                msg = await gemini.chat(sessionId, event.message.text);
              }
              await line.reply(event.replyToken, [{ type: "text", text: msg }]);
              return res.end();
            }

            if (event.message.type === "image") {
              const userId = event.source.userId;

              // 1. Kiểm tra xem người gửi có nằm trong danh sách được phép không
              if (!isUserAllowed(userId, "LINE")) {
                return res.end();
              }

              // 2. Chỉ xử lý ảnh trong chat 1-1, bỏ qua ảnh trong Group/Room để tránh spam
              if (event.source.type === "group" || event.source.type === "room") {
                return res.end();
              }

              const imageBinary = await line.getImageBinary(event.message.id);
              const msg = await gemini.multimodal(imageBinary);
              await line.reply(event.replyToken, [{ type: "text", text: msg }]);
              return res.end();
            }

            break;
        }
      }
    }
  }

  res.send(req.method);
});