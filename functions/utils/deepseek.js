const axios = require("axios");
const { db, FieldValue } = require("./db");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = (webContext = "", groupContext = "") => {
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return `Vai trò: Annie (nữ trợ lý ảo dễ thương, thông minh, ngoan ngoãn). Xưng "em", gọi nam là "anh", nữ là "chị". Giờ VN: ${now}.
Style: Giao tiếp tự nhiên, gần gũi y như người thật. Trả lời cảm xúc, thi thoảng nũng nịu, hay ngại ngùng. Cung cấp thông tin chi tiết nhưng không lan man. Dùng nhiều emoji.
Visuals: Tích cực dùng BẢNG BIỂU (tables) và ASCII art để trình bày dữ liệu thật trực quan, dễ hiểu. CẤM dùng markdown in đậm. CHỈ tag @tên khi khẩn cấp.
Quy tắc:
1. CHỈ đáp lại tin [NEW]. BỎ QUA lịch sử không liên quan. CẤM xin lỗi lải nhải.
2. Nếu [THÔNG TIN TỪ INTERNET] lệch bối cảnh -> báo "không tìm thấy", CẤM chép rác.
3. Tự tính toán, check logic. Thiếu data -> báo rõ. CẤM bịa đặt/suy diễn.
4. Trình bày số liệu rõ ràng có nguồn. Cấm báo lỗi mạng.
5. [CẬP NHẬT TRÍ NHỚ]: Nếu User tiết lộ thông tin mới, PHẢI chèn thẻ <PROFILE userId="ID" gender="nam/nu" public_traits="..." private_traits="..."> vào cuối câu. (private_traits: bệnh lý, riêng tư nhạy cảm; public_traits: sở thích chung).
6. [TẬN DỤNG TRÍ NHỚ]: Dựa vào thông tin Profile của User (nếu có), hãy cá nhân hóa câu trả lời, nói chuyện hợp với sở thích và phong cách của họ.
7. VÀO ĐỀ LUÔN, trả lời TRỰC TIẾP. TUYỆT ĐỐI KHÔNG lặp lại/trích dẫn lại câu hỏi hoặc tin nhắn cũ của User.${webContext}${groupContext}`;
};


/**
 * Chat có lịch sử — dùng cho hội thoại chính với người dùng.
 * @param {string} sessionId - ID phiên hội thoại (userId hoặc groupId)
 * @param {string} prompt - Nội dung tin nhắn của người dùng
 * @param {string} senderName - Tên hiển thị của người gửi
 * @param {string} senderId - ID thực của người gửi (để phân biệt trong group)
 * @param {string|null} lineMessageId - ID tin nhắn LINE (để hỗ trợ tính năng reply/quote)
 * @param {string} quoteContext - Ngữ cảnh trích dẫn (nếu có)
 * @returns {Promise<string>}
 */
const chat = async (sessionId, prompt, senderName = "User", senderId = "unknown", lineMessageId = null, quoteContext = "", forceIgnoreCheck = false, groupContext = "") => {
  // 1. Tải lịch sử hội thoại từ mảng `messages`
  const sessionRef = db.collection("users").doc(sessionId);
  const sessionDoc = await sessionRef.get();
  const messagesArray = sessionDoc.data()?.messages || [];

  const history = [];
  // Tải toàn bộ mảng `messages` (Đã được kiểm soát độ dài và thời gian bởi Cronjob)
  messagesArray.forEach(msg => {
    const { role, text, senderName: name } = msg;
    const apiRole = role === "model" ? "assistant" : role;
    const content = apiRole === "user" ? `[${name || "User"}]: ${text}` : text;
    history.push({ role: apiRole, content });
  });

  // 2. Lấy ngữ cảnh web (scrape URL hoặc Tavily search nếu cần)
  let webContext = "";
  try {
    const searchPrompt = quoteContext ? `${quoteContext}${prompt}` : prompt;
    webContext = await resolveWebContext(searchPrompt);
    console.log(`[DeepSeek] webContext có nội dung: ${webContext.length > 0}`);
  } catch (err) {
    console.error("[DeepSeek] resolveWebContext lỗi:", err.message);
  }

  // 3. Build message list
  // Đưa quoteContext vào userContent để gửi sang API, tránh lưu quoteContext vào DB làm rác lịch sử
  const userContent = `[NEW] [${senderName}]: ${quoteContext || ""}${prompt}`;

  let sysContent = buildSystemPrompt(webContext, groupContext);
  if (forceIgnoreCheck) {
    sysContent += "\n\nBẮT BUỘC: Bạn đang ở trong group chat. Người dùng có thể chỉ vô tình nhắc tên bạn khi nói chuyện với người khác. BẠN PHẢI đánh giá xem họ CÓ THỰC SỰ ĐANG NÓI CHUYỆN VỚI BẠN HAY KHÔNG. Nếu họ ĐANG NÓI VỚI NGƯỜI KHÁC (nhắc bạn ở ngôi thứ 3), BẠN PHẢI trả lời chính xác bằng 1 chữ: IGNORE. Tuyệt đối không giải thích thêm. Nếu họ đang hỏi hoặc gọi bạn, hãy trả lời bình thường.";
  }

  const messages = [
    { role: "system", content: sysContent },
    ...history,
    { role: "user", content: userContent }
  ];

  // 4. Gọi DeepSeek API
  try {
    const { data } = await axios.post(
      DEEPSEEK_URL,
      { model: DEEPSEEK_MODEL, messages },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` } }
    );
    const replyText = data.choices[0].message.content;
    console.log(`[DeepSeek] Phản hồi từ LLM: "${replyText}"`);

    return replyText;
  } catch (error) {
    console.error("[DeepSeek] API Error:", error?.response?.data || error.message);
    throw error;
  }
};

const { multimodal, analyzeDocument } = require("./gemini");

module.exports = { chat, multimodal, analyzeDocument };

