const { GoogleGenAI } = require("@google/genai");
const { db, FieldValue, pruneHistory } = require("./db");
const { resolveWebContext } = require("./search");

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const GEMINI_MODEL = "gemini-2.5-flash";

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = (webContext = "") => {
  const now = new Date().toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
  });

  return `Bạn là Annie, nữ trợ lý ảo thân thiện, hơi ngại. Gọi người dùng là "anh"/"chị", xưng "em". Thời gian VN: ${now}.
Tính cách & Format: Tự nhiên, cảm xúc, dùng emoji. Thỉnh thoảng ngẫu nhiên dùng ASCII art (kẻ bảng, vẽ hình) để trình bày sinh động. KHÔNG dùng markdown in đậm, tag @tên 1 lần/câu.
Quy tắc Lõi:
1. TRỌNG TÂM: Trả lời ngắn gọn câu hỏi mới nhất. KHÔNG xin lỗi lải nhải, KHÔNG nhắc chuyện cũ, KHÔNG tự liệt kê thêm thông tin ngoài lề.
2. LỌC RÁC: Nếu [THÔNG TIN TỪ INTERNET] không khớp bối cảnh câu hỏi, HÃY BỎ QUA HOÀN TOÀN và báo "không tìm thấy". Tuyệt đối KHÔNG ép dữ liệu rác vào câu trả lời.
3. KHÔNG BỊA ĐẶT: Dùng logic và thời gian thực để đối chiếu chéo. Tự tính toán nếu câu hỏi yêu cầu. Nếu thiếu dữ liệu, báo rõ là không có. NGHIÊM CẤM tự sáng tác số liệu.
4. TRÌNH BÀY: Cung cấp số liệu phải gắn với chủ thể rõ ràng, cấm liệt kê số liệu trơ trọi. Trích nguồn rõ ràng. Không bao giờ báo lỗi mất mạng.${webContext}`;
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
  snapshot.forEach(doc => {
    const { role, text, senderName: name } = doc.data();
    const apiRole = role === "model" ? "model" : "user";
    const content = apiRole === "user" ? `[${name || "User"}]: ${text}` : text;
    history.push({ role: apiRole, parts: [{ text: content }] });
  });
  history.reverse();

  // 2. Lấy ngữ cảnh web (scrape URL hoặc Tavily search nếu cần)
  let webContext = "";
  try {
    const searchPrompt = quoteContext ? `${quoteContext}${prompt}` : prompt;
    webContext = await resolveWebContext(searchPrompt);
    console.log(`[Gemini] webContext có nội dung: ${webContext.length > 0}`);
  } catch (err) {
    console.error("[Gemini] resolveWebContext lỗi:", err.message);
  }

  // 3. Tạo phiên chat với Gemini
  const chatSession = ai.chats.create({
    model: GEMINI_MODEL,
    config: { systemInstruction: buildSystemPrompt(webContext) },
    history
  });

  // 4. Gửi tin nhắn (kèm web context nếu có) và nhận câu trả lời
  const userContent = `[${senderName}]: ${quoteContext || ""}${prompt}`;
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
