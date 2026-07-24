const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/snow/Documents/www/LINE-Chatbot/functions/.env.tele-ai-chatbot" });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN;
const WEBHOOK_URL = "https://webhook-wsokmtbtsq-uc.a.run.app";

const setWebhook = async () => {
  console.log("=== THIẾT LẬP WEBHOOK TELEGRAM KÈM SECRET TOKEN ===");
  console.log("Bot Token:", TELEGRAM_TOKEN ? "Đã nạp" : "Trống");
  console.log("Secret Token:", SECRET_TOKEN);
  console.log("Webhook URL:", WEBHOOK_URL);

  if (!TELEGRAM_TOKEN) {
    console.error("Lỗi: Thiếu TELEGRAM_BOT_TOKEN trong file env!");
    return;
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`;
  try {
    const res = await axios.post(url, {
      url: WEBHOOK_URL,
      secret_token: SECRET_TOKEN
    });
    console.log("Kết quả từ Telegram API:", res.data);
  } catch (error) {
    console.error("Lỗi khi set webhook:", error.response ? error.response.data : error.message);
  }
};

setWebhook();
