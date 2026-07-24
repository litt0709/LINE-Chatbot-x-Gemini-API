const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/snow/Documents/www/LINE-Chatbot/functions/.env.tele-ai-chatbot" });

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const { rtdb } = require("./utils/db");
const telegram = require("./utils/telegram");

const trigger = async () => {
  const factId = "fact_vinuni_test_eddy_" + Math.random().toString(36).substr(2, 5);
  const pendingData = {
    targetId: "test_manual_session",
    topic: "vinuni",
    keywords: ["nguyen thanh nam", "vinuni", "hieu truong"],
    content: "Nguyễn Thành Nam là cựu Hiệu trưởng đầu tiên của VinUni.",
    link: "https://vnexpress.net/nguyen-thanh-nam-lam-hieu-truong-vinuni-abc",
    senderName: "Eddy",
    platform: "Telegram",
    createdAt: Date.now()
  };

  // 1. Lưu vào pending facts trên RTDB
  await rtdb.ref(`facts/pending/${factId}`).set(pendingData);
  console.log("Saved pending fact:", factId);

  const EDDY_TELEGRAM_ID = process.env.TELEGRAM_ADMIN_APPPROVAL_ID || "-1003832428084";
  const messageText = `💡 <b>Đề xuất Global Fact mới</b>\n` +
    `• <b>Người dạy:</b> Eddy (Telegram)\n` +
    `• <b>Chủ đề:</b> vinuni\n` +
    `• <b>Từ khóa:</b> nguyen thanh nam, vinuni, hieu truong\n` +
    `• <b>Nội dung:</b> Nguyễn Thành Nam là cựu Hiệu trưởng đầu tiên của VinUni.\n` +
    `• <b>Nguồn chứng minh:</b> <a href="https://vnexpress.net/nguyen-thanh-nam-lam-hieu-truong-vinuni-abc">https://vnexpress.net/nguyen-thanh-nam-lam-hieu-truong-vinuni-abc</a>\n\n` +
    `<i>Nhấn nút dưới để phê duyệt làm Global Fact (dùng chung toàn hệ thống):</i>`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Duyệt Global", callback_data: JSON.stringify({ a: "ap_f", id: factId }) },
        { text: "❌ Từ chối", callback_data: JSON.stringify({ a: "rj_f", id: factId }) }
      ]
    ]
  };

  console.log(`Sending to chat_id: ${EDDY_TELEGRAM_ID}...`);
  const axios = require("axios");
  const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
  try {
    const res = await axios.post(`${TELEGRAM_BASE_URL}/sendMessage`, {
      chat_id: EDDY_TELEGRAM_ID,
      text: messageText,
      parse_mode: "HTML",
      reply_markup: replyMarkup
    });
    console.log("Telegram API Response Success:", res.data);
  } catch (err) {
    console.error("Telegram API Error Detail:", err.response ? err.response.data : err.message);
  }
  process.exit(0);
};

trigger().catch(e => {
  console.error("Error:", e);
  process.exit(1);
});
