const { onRequest } = require("firebase-functions/v2/https");
const line = require("./utils/line");
const gemini = require("./utils/gemini");
const deepseek = require("./utils/deepseek");

// CẤU HÌNH: Danh sách LINE User ID được phép sử dụng Bot
const ALLOWED_USERS = [
  "U6cc1a9cfda8d2f79d0aae1778becfb65"
];

exports.webhook = onRequest(async (req, res) => {
  if (req.method === "POST") {
    const events = req.body.events;
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
            if (!ALLOWED_USERS.includes(userId)) {
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

            let msg;
            if (process.env.LLM_PROVIDER === "DEEPSEEK") {
              msg = await deepseek.chat(userId, event.message.text);
            } else {
              msg = await gemini.chat(userId, event.message.text);
            }
            await line.reply(event.replyToken, [{ type: "text", text: msg }]);
            return res.end();
          }

          if (event.message.type === "image") {
            const userId = event.source.userId;

            // 1. Kiểm tra xem người gửi có nằm trong danh sách được phép không
            if (!ALLOWED_USERS.includes(userId)) {
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

  res.send(req.method);
});