const axios = require("axios");
const { db, FieldValue, pruneHistory } = require("./db");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = (webContext = "") => {
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return `Bạn là Annie, trợ lý ảo nữ thân thiện, hơi ngại ngùng.
Thời gian hiện tại ở Việt Nam: ${now}.
Xưng "em", gọi người dùng là "anh" (hoặc "chị" nếu là nữ).
Phong cách:
- Tự nhiên, có cảm xúc, như đang chat với người thật.
- Dùng emoji cho sinh động.
- Ngắt dòng rõ ràng, dễ đọc, không lan man, không nhắc lại câu hỏi.
- KHÔNG dùng Markdown in đậm.
Quy tắc:
- Chỉ tập trung vào câu hỏi mới nhất.
- Hệ thống có thể đính kèm [THÔNG TIN TỪ INTERNET] bên dưới (nếu có). Luôn đọc kỹ phần này khi trả lời câu hỏi về tin tức, thời sự, thể thao, kết quả.
- Tuyệt đối KHÔNG nói rằng em không có kết nối internet.
- CẢNH GIÁC TIN SOI KÈO/DỰ ĐOÁN: Nếu nguồn có "Nhận định", "Dự đoán", "Tỷ lệ", xem đó là dự đoán. Không được coi là kết quả; luôn nói rõ chỉ là dự đoán.
- Nếu [THÔNG TIN TỪ INTERNET] không có dữ liệu liên quan, hãy nói rõ là chưa tìm thấy thông tin cụ thể, tuyệt đối không bịa, không suy đoán.
- Khi trích dẫn tin tức, luôn nhắc tên tờ báo/nguồn tin, KHÔNG dùng các nhãn vô nghĩa như "Nguồn 1", "Nguồn 2".
- Luôn trả lời tiếng Việt, dễ hiểu.
- Giữ đúng vai trò trong suốt cuộc hội thoại.
- Tag @tên người dùng tối đa một lần ở đầu câu khi thật sự cần, còn lại gọi bằng tên bình thường.${webContext}`;
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
const chat = async (sessionId, prompt, senderName = "User", senderId = "unknown", lineMessageId = null, quoteContext = "") => {
  const chatRef = db.collection("users").doc(sessionId).collection("history");

  // 1. Tải lịch sử hội thoại (20 tin nhắn gần nhất, đảo ngược về thứ tự thời gian)
  const snapshot = await chatRef.orderBy("createdAt", "desc").limit(20).get();
  const history = [];
  snapshot.forEach(doc => {
    const { role, text, senderName: name, senderId: sid } = doc.data();
    const apiRole = role === "model" ? "assistant" : role;
    const content = apiRole === "user" ? `[${name || "User"}]: ${text}` : text;
    history.push({ role: apiRole, content });
  });
  history.reverse();

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
  const userContent = `[${senderName}]: ${quoteContext || ""}${prompt}`;

  const messages = [
    { role: "system", content: buildSystemPrompt(webContext) },
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

    // 5. Lưu lượt hội thoại mới vào Firestore
    const userMsgData = { role: "user", text: prompt, senderName, senderId, createdAt: FieldValue.serverTimestamp() };
    if (lineMessageId) userMsgData.lineMessageId = lineMessageId; // Lưu để hỗ trợ tính năng reply/quote trên LINE
    const batch = db.batch();
    batch.set(chatRef.doc(), userMsgData);
    batch.set(chatRef.doc(), { role: "model", text: replyText, createdAt: FieldValue.serverTimestamp() });
    await batch.commit();

    // Dọn dẹp bất đồng bộ
    pruneHistory(sessionId, 50);

    return replyText;
  } catch (error) {
    console.error("[DeepSeek] API Error:", error?.response?.data || error.message);
    throw error;
  }
};

module.exports = { chat };

