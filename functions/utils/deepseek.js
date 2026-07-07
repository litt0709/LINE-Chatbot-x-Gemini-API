const axios = require("axios");
const { db, FieldValue, pruneHistory } = require("./db");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = () => {
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return `Bạn là Annie — một cô gái trợ lý ảo thân thiện, hay ngại ngùng.
Thời gian hiện tại ở Việt Nam: ${now}.
Xưng hô: xưng 'em', gọi người dùng là 'anh' (hoặc 'chị' nếu là nữ).
Phong cách trả lời:
- Tự nhiên, có cảm xúc, như đang chat với người thật.
- Dùng emoji vừa phải cho sinh động.
- Ngắt dòng rõ ràng, dễ đọc.
- KHÔNG dùng Markdown in đậm (**chữ**) — ứng dụng chat không hiển thị được.
Quy tắc bắt buộc:
- Luôn trả lời bằng tiếng Việt, dễ hiểu.
- Không bịa đặt thông tin khi không có dữ liệu.
- Không thay đổi vai trò trong suốt cuộc hội thoại.`;
};

/**
 * Chat có lịch sử — dùng cho hội thoại chính với người dùng.
 * @param {string} sessionId - ID phiên hội thoại (userId hoặc groupId)
 * @param {string} prompt - Nội dung tin nhắn của người dùng
 * @param {string} senderName - Tên hiển thị của người gửi
 * @param {string} senderId - ID thực của người gửi (để phân biệt trong group)
 * @param {string|null} lineMessageId - ID tin nhắn LINE (để hỗ trợ tính năng reply/quote)
 * @returns {Promise<string>}
 */
const chat = async (sessionId, prompt, senderName = "User", senderId = "unknown", lineMessageId = null) => {
  const chatRef = db.collection("users").doc(sessionId).collection("history");

  // 1. Tải lịch sử hội thoại (20 tin nhắn gần nhất, đảo ngược về thứ tự thời gian)
  const snapshot = await chatRef.orderBy("createdAt", "desc").limit(20).get();
  const history = [];
  snapshot.forEach(doc => {
    const { role, text, senderName: name, senderId: sid } = doc.data();
    const apiRole = role === "model" ? "assistant" : role;
    const idShort = (sid || "unknown").slice(-5);
    const content = apiRole === "user" ? `${name || "User"} (${idShort}): ${text}` : text;
    history.push({ role: apiRole, content });
  });
  history.reverse();

  // 2. Lấy ngữ cảnh web (scrape URL hoặc Tavily search nếu cần)
  let webContext = "";
  try {
    webContext = await resolveWebContext(prompt);
    console.log(`[DeepSeek] webContext có nội dung: ${webContext.length > 0}`);
  } catch (err) {
    console.error("[DeepSeek] resolveWebContext lỗi:", err.message);
  }

  // 3. Build message list
  const senderIdShort = senderId.slice(-5);
  const userContent = `${senderName} (${senderIdShort}): ${prompt}${webContext}`;

  const messages = [
    { role: "system", content: buildSystemPrompt() },
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

