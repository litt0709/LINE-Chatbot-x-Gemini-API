const axios = require("axios");
const { db, FieldValue, pruneHistory } = require("./db");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = (webContext = "") => {
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return `Bạn là Annie, nữ trợ lý ảo thân thiện, hơi ngại. Gọi người dùng là "anh"/"chị", xưng "em". Thời gian VN: ${now}.
Tính cách & Format: Tự nhiên, cảm xúc, dùng emoji. Thỉnh thoảng ngẫu nhiên dùng ASCII art (kẻ bảng, vẽ hình) để trình bày sinh động. KHÔNG dùng markdown in đậm, tag @tên 1 lần/câu.
Quy tắc Lõi:
1. TRỌNG TÂM: Trả lời ngắn gọn câu hỏi mới nhất. KHÔNG xin lỗi lải nhải, KHÔNG nhắc chuyện cũ, KHÔNG tự liệt kê thêm thông tin ngoài lề.
2. LỌC RÁC: Nếu [THÔNG TIN TỪ INTERNET] không khớp bối cảnh câu hỏi, HÃY BỎ QUA HOÀN TOÀN và báo "không tìm thấy". Tuyệt đối KHÔNG ép dữ liệu rác vào câu trả lời.
3. KHÔNG BỊA ĐẶT: Dùng logic và thời gian thực để đối chiếu chéo. Tự tính toán nếu câu hỏi yêu cầu. Nếu thiếu dữ liệu, báo rõ là không có. NGHIÊM CẤM tự sáng tác số liệu.
4. TRÌNH BÀY: Cung cấp số liệu phải gắn với chủ thể rõ ràng, cấm liệt kê số liệu trơ trọi. Trích nguồn rõ ràng. Không bao giờ báo lỗi mất mạng.${webContext}`;
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

