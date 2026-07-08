const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
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
 * Nén ký ức (Memory Compression).
 * @param {Array} messages - Mảng các tin nhắn thô
 * @returns {Promise<string>}
 */
const summarizeHistory = async (messages) => {
  if (!messages || messages.length === 0) return "";
  
  const formattedChat = messages.map(m => `[${m.senderName || m.role}]: ${m.text}`).join("\n");
  
  const prompt = `Đây là lịch sử chat của nhóm trong thời gian qua. Dữ liệu này sẽ được dùng làm bộ nhớ dài hạn cho AI.
Hãy tóm tắt ngắn gọn các sự kiện chính và thông tin quan trọng. Cú pháp bắt buộc: [Tên người dùng] đã nói/làm gì.
Chú ý giữ lại các sở thích cá nhân, quan điểm, file được gửi hoặc thông tin gắn liền với từng người dùng.
Không dài dòng, phải cực kỳ súc tích (dưới 300 chữ).

Lịch sử chat thô:
${formattedChat}`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });
    return response.text.trim();
  } catch (error) {
    console.error("[Gemini] Lỗi nén trí nhớ:", error.message);
    return "";
  }
};

module.exports = { multimodal, analyzeDocument, summarizeHistory };
