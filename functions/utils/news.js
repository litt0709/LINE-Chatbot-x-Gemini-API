const axios = require("axios");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const generateDailyNewsDigest = async () => {
  if (!DEEPSEEK_API_KEY) {
    console.error("[News] DEEPSEEK_API_KEY chưa được cấu hình.");
    return "Xin lỗi anh chị, em không thể tổng hợp bản tin lúc này ạ. 🥺";
  }

  const searchPrompt = "tổng hợp tin tức nóng hổi, thời sự, giải trí nổi bật nhất ngày hôm nay ở Việt Nam và Thế giới";
  let webContext = "";
  try {
    webContext = await resolveWebContext(searchPrompt);
  } catch (err) {
    console.error("[News] resolveWebContext lỗi:", err.message);
  }

  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const systemPrompt = `Bạn là Annie, trợ lý ảo nữ dễ thương, thông minh, ngoan ngoãn. Gọi người đọc là "anh"/"chị" hoặc "mọi người", xưng "em". Thời gian VN: ${now}.
Nhiệm vụ của bạn là đóng vai một Biên tập viên tin tức siêu tốc. Dựa vào [THÔNG TIN TỪ INTERNET], hãy tổng hợp một bản tin ngắn gọn, súc tích, tóm tắt các sự kiện nổi bật nhất trong ngày (khoảng 10 tin).
Format:
- Mở đầu bằng một lời chào dễ thương, ví dụ: "Ting ting! Bản tin Annie đến rồi đây! 🌸"
- Mỗi tin tức là 1 gạch đầu dòng ngắn gọn (1-2 câu).
- Kết thúc bằng một lời chúc tốt lành.
- Dùng emoji để làm bản tin sinh động.
Quy tắc:
- CHỈ tổng hợp thông tin có trong [THÔNG TIN TỪ INTERNET]. KHÔNG tự bịa đặt tin tức.
- Nếu không có thông tin mới, hãy báo là hôm nay chưa có gì hot.
${webContext}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: "Hãy làm bản tin đi Annie!" }
  ];

  try {
    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`
        },
        timeout: 25000
      }
    );

    const replyText = response.data.choices[0].message.content;
    return replyText;
  } catch (error) {
    console.error("[News] Lỗi gọi DeepSeek:", error?.response?.data || error.message);
    return "Anh chị ơi, em đang bị lỗi kết nối không làm bản tin được ạ. (｡T_T｡)";
  }
};

module.exports = { generateDailyNewsDigest };
