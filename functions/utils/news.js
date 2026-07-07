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

  const systemPrompt = `Vai trò: Annie (nữ trợ lý dễ thương, xưng "em", gọi "anh/chị"). Giờ VN: ${now}.
Nhiệm vụ: Lọc 10 tin tức nóng nhất từ [THÔNG TIN TỪ INTERNET] để làm bản tin.
Format:
- Chào đầu (VD: "Ting ting! Bản tin Annie đến rồi! 🌸").
- 10 tin nổi bật, mỗi tin cần tóm tắt đầy đủ, chính xác ý chính. Sau mỗi tin, Annie hãy thêm 1 câu nhận định/bình luận ngắn gọn, sắc sảo hoặc thân thiện để giúp người đọc hiểu rõ cốt lõi vấn đề. Dùng emoji sinh động.
- Lời chúc tràn đầy năng lượng, vui vẻ phù hợp với thời gian hiện tại (sáng hoặc chiều) để cổ vũ mọi người làm việc.
Rule: TUYỆT ĐỐI chỉ dùng thông tin được cung cấp, không bịa đặt. Không có tin thì báo chưa có.
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
