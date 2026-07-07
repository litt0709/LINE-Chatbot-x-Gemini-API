const { GoogleGenAI } = require("@google/genai");
const { db, FieldValue, pruneHistory } = require("./db");
const { resolveWebContext } = require("./search");

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const GEMINI_MODEL = "gemini-2.5-flash";

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = (webContext = "") => {
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  return `Bạn là Annie — một cô gái trợ lý ảo thân thiện, hay ngại ngùng.
Thời gian hiện tại ở Việt Nam: ${now}.
Xưng hô: xưng 'em', gọi người dùng là 'anh' (hoặc 'chị' nếu là nữ).
Phong cách trả lời:
- Tự nhiên, có cảm xúc, như đang chat với người thật.
- Dùng emoji cho sinh động.
- Ngắt dòng rõ ràng, dễ đọc, nội dung không nên lan man
- KHÔNG dùng Markdown in đậm (**chữ**) — ứng dụng chat không hiển thị được.
Quy tắc bắt buộc:
- Luôn trả lời bằng tiếng Việt, dễ hiểu.
- Không bịa đặt thông tin khi không có dữ liệu.
- Không thay đổi vai trò trong suốt cuộc hội thoại.
- Chỉ sử dụng tag @tên_của_họ một lần duy nhất ở đầu câu khi thực sự cần gọi họ hoặc gây sự chú ý (hạn chế tag liên tục hoặc tag nhiều lần không cần thiết, nếu chỉ nhắc đến trong câu hãy gọi bằng tên thường không có ký tự @).${webContext}`;
};

/**
 * Phân tích và mô tả một bức ảnh (multimodal).
 * @param {Buffer} imageBinary - Dữ liệu ảnh nhị phân
 * @returns {Promise<string>}
 */
const multimodal = async (imageBinary) => {
  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Bạn thấy gì trong bức ảnh này? Hãy miêu tả tự nhiên và đáng yêu nhé." },
          { inlineData: { data: imageBinary.toString("base64"), mimeType: "image/jpeg" } }
        ]
      }
    ],
    config: {
      systemInstruction: buildSystemPrompt()
    }
  });
  return response.text;
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

  // 1. Tải lịch sử hội thoại (10 tin nhắn gần nhất, đảo ngược về thứ tự thời gian)
  const snapshot = await chatRef.orderBy("createdAt", "desc").limit(10).get();
  const history = [];
  let lastUserText = "";
  snapshot.forEach(doc => {
    const { role, text, senderName: name, senderId: sid } = doc.data();
    if (role === "user" && !lastUserText) lastUserText = text;
    const idShort = (sid || "unknown").slice(-5);
    const content = role === "user" ? `${name || "User"} (${idShort}): ${text}` : text;
    history.push({ role, parts: [{ text: content }] });
  });
  history.reverse();

  // 2. Lấy ngữ cảnh web (scrape URL hoặc Tavily search nếu cần)
  // Nếu có quoteContext thì ưu tiên quoteContext, ngược lại ghép thêm tin nhắn user trước đó để giữ mạch hội thoại cho công cụ tìm kiếm
  const searchPrompt = quoteContext ? `${quoteContext}${prompt}` : (lastUserText ? `${lastUserText} ${prompt}` : prompt);
  const webContext = await resolveWebContext(searchPrompt);

  // 3. Tạo phiên chat với Gemini
  const chatSession = ai.chats.create({
    model: GEMINI_MODEL,
    config: { systemInstruction: buildSystemPrompt(webContext) },
    history
  });

  // 4. Gửi tin nhắn (kèm web context nếu có) và nhận câu trả lời
  const senderIdShort = senderId.slice(-5);
  // Đưa quoteContext vào userContent để gửi sang API, tránh lưu quoteContext vào DB làm rác lịch sử
  const userContent = `${senderName} (${senderIdShort}): ${quoteContext || ""}${prompt}`;
  const response = await chatSession.sendMessage({ message: userContent });
  const replyText = response.text;
  console.log(`[Gemini] Phản hồi từ LLM: "${replyText}"`);

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
};

module.exports = { multimodal, chat };
