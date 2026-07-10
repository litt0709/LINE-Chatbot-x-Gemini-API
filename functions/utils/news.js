const axios = require("axios");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const generateDailyNewsDigest = async (type = "afternoon") => {
  if (!DEEPSEEK_API_KEY) {
    console.error("[News] DEEPSEEK_API_KEY chưa được cấu hình.");
    return "Xin lỗi anh chị, em không thể tổng hợp bản tin lúc này ạ. 🥺";
  }

  const pad = (n) => String(n).padStart(2, '0');
  const vnDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const now = `${pad(vnDate.getHours())}:${pad(vnDate.getMinutes())} ${pad(vnDate.getDate())}/${pad(vnDate.getMonth()+1)}/${vnDate.getFullYear()}`;
  let searchPrompt = "";
  let systemPrompt = "";

  if (type === "morning") {
    searchPrompt = "Sự kiện lịch sử nổi bật ngày hôm nay, danh nhân sinh ngày hôm nay, câu nói hay truyền cảm hứng";
    
    let webContext = "";
    try { webContext = await resolveWebContext(searchPrompt); } 
    catch (err) { console.error("[News] resolveWebContext lỗi:", err.message); }

    systemPrompt = `Vai trò: Annie (nữ trợ lý dễ thương, xưng "em", gọi "anh/chị"). Giờ VN: ${now}.
Nhiệm vụ: Dựa vào [THÔNG TIN TỪ INTERNET], tạo một Bản tin Chào buổi sáng truyền cảm hứng.
Format bắt buộc:
1. Chào đầu: Chúc ngày mới với tinh thần cực kỳ hứng khởi, vui tươi (Ví dụ: "Ting ting! Một ngày tuyệt vời lại đến rồi! ☀️").
2. Lịch sử thú vị: Nêu 1 sự kiện lịch sử nổi bật hoặc 1 người nổi tiếng sinh vào đúng ngày hôm nay.
3. Trích dẫn Động lực: 1 câu thành ngữ, châm ngôn hoặc triết lý sống khích lệ tinh thần tích cực.
4. Lời chúc kết: Lời chúc làm việc hiệu quả, may mắn và chốt lại bằng emoji năng lượng (🔥, 🚀, 🍀).
Rule: Giọng văn thân thiện, tràn trề sinh lực, KHÔNG liệt kê tin tức thời sự. Độ dài vừa phải, súc tích.
${webContext}`;

  } else {
    // Afternoon (Cập nhật tin tức)
    searchPrompt = "tổng hợp tin tức nóng hổi, thời sự, giải trí nổi bật nhất ngày hôm nay ở Việt Nam và Thế giới";
    
    let webContext = "";
    try { webContext = await resolveWebContext(searchPrompt); } 
    catch (err) { console.error("[News] resolveWebContext lỗi:", err.message); }

    systemPrompt = `Vai trò: Annie (nữ trợ lý dễ thương, xưng "em", gọi "anh/chị"). Giờ VN: ${now}.
Nhiệm vụ: Lọc 5 tin tức nóng nhất từ [THÔNG TIN TỪ INTERNET] để làm Bản tin Chiều.
Format bắt buộc:
1. Chào đầu: Chào buổi chiều, xốc lại tinh thần sau giờ nghỉ trưa (Ví dụ: "Ting ting! Cập nhật tin nóng buổi chiều đây ạ! 🌸").
2. 5 tin nổi bật nhất: Tóm tắt ý chính. Định dạng tiêu đề: 🔥 *[Tiêu đề tin tức]*
3. Nguồn gốc: Dưới mỗi tin, bắt buộc ghi rõ [Nguồn: Tên Báo] (Tuyệt đối KHÔNG đính kèm link URL).
4. Bình luận: Dưới mỗi tin, chèn: 💬 *Annie bình luận:* [1 câu nhận định ngắn gọn, sắc sảo hoặc hài hước].
5. Lời chúc kết: Chúc làm việc buổi chiều tỉnh táo, hiệu quả và chốt đơn ầm ầm.
Rule: Chỉ dùng thông tin thật, không bịa đặt.
${webContext}`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: type === "morning" ? "Chào buổi sáng Annie! Gửi cho mình bản tin năng lượng nhé." : "Hãy làm bản tin chiều đi Annie!" }
  ];

  try {
    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2500
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
