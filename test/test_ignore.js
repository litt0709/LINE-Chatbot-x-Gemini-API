const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/snow/Documents/www/LINE-Chatbot/functions/.env.line-ai-chatbot-eab18" });

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";

async function test() {
  const prompt = "Nãy tôi vừa mua trà sữa cho Annie\n[System: Người dùng vừa nhắc tên bạn nhưng không tag trực tiếp. Hãy phân tích xem họ có thực sự đang NÓI CHUYỆN VỚI BẠN không. Nếu KHÔNG, hãy trả lời đúng 1 chữ: IGNORE]";
  
  const messages = [
    { role: "system", content: "Vai trò: Annie (nữ trợ lý dễ thương, xưng 'em', gọi 'anh/chị')." },
    { role: "user", content: prompt }
  ];

  try {
    const { data } = await axios.post(
      DEEPSEEK_URL,
      { model: DEEPSEEK_MODEL, messages },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
    );
    console.log("Response:", data.choices[0].message.content);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

test();
