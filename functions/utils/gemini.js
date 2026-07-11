const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const { db } = require("./db");
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const GEMINI_MODEL = "gemini-2.5-flash";


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
          { text: "Hãy miêu tả chi tiết, khách quan và chính xác những gì bạn thấy trong bức ảnh này." },
          { inlineData: { data: imageBinary.toString("base64"), mimeType: "image/jpeg" } }
        ]
      }
    ]
  });
  return response.text;
};

/**
 * Phân tích tài liệu (PDF, Excel, Word...) bằng File API.
 * @param {string} localFilePath - Đường dẫn file local (thường ở /tmp/)
 * @returns {Promise<string>}
 */
const analyzeDocument = async (localFilePath) => {
  let uploadResult = null;
  try {
    uploadResult = await ai.files.upload({ file: localFilePath });
    
    // Đợi 2 giây để Google xử lý file nội bộ trước khi gọi generate (tránh lỗi file not ready)
    await new Promise(resolve => setTimeout(resolve, 2000));

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
            { text: "Trích xuất và tóm tắt thông tin quan trọng nhất từ tài liệu này. Giữ lại các số liệu và ý chính. YÊU CẦU BẮT BUỘC: Bản tóm tắt phải cực kỳ súc tích, khách quan và TUYỆT ĐỐI KHÔNG VƯỢT QUÁ 1000 CHỮ." }
          ]
        }
      ]
    });
    return response.text;
  } catch (error) {
    console.error("[Gemini] Lỗi phân tích document:", error.message);
    return "Lỗi: Không thể phân tích nội dung tài liệu này.";
  } finally {
    if (uploadResult && uploadResult.name) {
      ai.files.delete({ name: uploadResult.name }).catch(e => console.error("[Gemini] Lỗi xóa file:", e.message));
    }
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  }
};

/**
 * Nén ký ức (Memory Compression) và tạo Audit Log.
 * @param {Array} messages - Mảng các tin nhắn thô
 * @param {string} sessionId - ID của session/group để track log
 * @returns {Promise<string>} Trả về string tóm tắt theo format cũ
 */
const summarizeHistory = async (messages, sessionId = "unknown") => {
  if (!messages || messages.length === 0) return "";
  
  const formattedChat = messages.map(m => `[${m.senderName || m.role}]: ${m.text}`).join("\n");
  
  const prompt = `Đây là lịch sử chat của nhóm. Nhiệm vụ của bạn:
1. Tóm tắt ngắn gọn các sự kiện chính dưới 1000 chữ. BẮT BUỘC format rõ ràng: dùng ký tự \\n để ngắt dòng, phân các ý bằng gạch đầu dòng (-) hoặc emoji (📌, 👉), và bôi đậm ý chính bằng **text**.
2. Xác định 01 chủ đề NỔI BẬT NHẤT (VD: World Cup 2026). Nếu không rõ, ghi "None".
3. Phân tích Audit Keywords: Tìm các từ khóa tìm kiếm user dùng mà hệ thống có thể cần. Đánh giá xem nó có phải sự kiện trong ngày (is_today_sensitive) và phân loại vào (NEWS/FINANCE/DEV/SOCIAL/GENERAL).
4. Phân tích Audit Issues: Tìm các câu trả lời sai hoặc ngớ ngẩn của bot (Hallucination) so với câu hỏi.

BẮT BUỘC TRẢ VỀ ĐÚNG ĐỊNH DẠNG JSON SAU (chỉ chứa JSON, được phép dùng \\n và dấu gạch ngang bên trong chuỗi string):
{
  "summary": "Nội dung tóm tắt...\\n- 📌 **Sự kiện 1:** ...\\n- 👉 **Sự kiện 2:** ...",
  "hot_topic": "World Cup 2026",
  "audit_keywords": [
    { "word": "từ khóa", "is_today_sensitive": false, "suggested_category": "NEWS", "reason": "lý do" }
  ],
  "audit_issues": [
    { "user_question": "...", "bot_answer": "...", "issue_type": "hallucination", "severity": "HIGH", "note": "..." }
  ]
}

Lịch sử chat thô:
${formattedChat}`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json"
      }
    });
    const textResp = response.text.trim();
    
    let jsonObj = null;
    try {
      jsonObj = JSON.parse(textResp);
    } catch (parseErr) {
      const cleaned = textResp.replace(/```json/gi, "").replace(/```/g, "").trim();
      jsonObj = JSON.parse(cleaned);
    }

    // Ghi Audit Log vào Firestore
    try {
      if ((jsonObj.audit_keywords && jsonObj.audit_keywords.length > 0) || (jsonObj.audit_issues && jsonObj.audit_issues.length > 0)) {
        const expireAtDate = new Date();
        expireAtDate.setDate(expireAtDate.getDate() + 30); // TTL 30 ngày
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          sessionId: sessionId,
          audit_keywords: jsonObj.audit_keywords || [],
          audit_issues: jsonObj.audit_issues || [],
          expireAt: expireAtDate
        });
        console.log(`[Audit Log] Ghi log thành công cho session ${sessionId}`);
      }
    } catch (dbErr) {
      console.error("[Audit Log] Lỗi ghi DB:", dbErr.message);
    }

    // Reconstruct the legacy string format so index.js continues to work without changing its regex logic
    return `${jsonObj.summary || ""}\n\n[HOT_TOPIC: ${jsonObj.hot_topic || "None"}]`;

  } catch (error) {
    console.error("[Gemini] Lỗi nén trí nhớ & audit:", error.message);
    return "";
  }
};

module.exports = { multimodal, analyzeDocument, summarizeHistory };
