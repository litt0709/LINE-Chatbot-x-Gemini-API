const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: `${process.env.API_KEY}` });

const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { scrapeUrl } = require("./search");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

const textOnly = async (prompt) => {
  // For text-only input
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction: "Bạn là một trợ lý ảo cực kỳ thân thiện, vui vẻ, xưng hô thân mật là 'mình' và gọi người dùng là 'bạn'. Hãy trả lời tự nhiên, gần gũi như một người bạn thực sự và ưu tiên sử dụng tiếng Việt",
    }
  });
  return response.text;
};

const multimodal = async (imageBinary) => {
  // For text-and-image input (multimodal)
  const contents = [
    {
      inlineData: {
        data: Buffer.from(imageBinary, "binary").toString("base64"),
        mimeType: "image/png"
      }
    },
    { text: "Hãy mô tả chi tiết bức ảnh này giúp tôi." }
  ];

  const safetySettings = [
    {
      category: "HARM_CATEGORY_HARASSMENT",
      threshold: "BLOCK_ONLY_HIGH"
    },
    {
      category: "HARM_CATEGORY_HATE_SPEECH",
      threshold: "BLOCK_ONLY_HIGH"
    },
    {
      category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      threshold: "BLOCK_ONLY_HIGH"
    },
    {
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      threshold: "BLOCK_ONLY_HIGH"
    }
  ];

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: contents,
    config: {
      safetySettings: safetySettings,
      systemInstruction: "Bạn là một chuyên gia phân tích ảnh vui vẻ. Hãy bình luận và mô tả bức ảnh này bằng tiếng Việt một cách tự nhiên, sinh động nhất."
    }
  });

  return response.text;
};

const chat = async (sessionId, prompt, senderName = "User", senderId = "unknown") => {
  const chatRef = db.collection("users").doc(sessionId).collection("history");

  // Lấy 10 tin nhắn gần nhất từ Firestore
  const snapshot = await chatRef.orderBy("createdAt", "desc").limit(10).get();

  const history = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    // Tạo nhãn người gửi kết hợp tên hiển thị và 5 số cuối của User ID để phân biệt trùng tên
    const senderIdShort = (data.senderId || "unknown").slice(-5);
    const content = data.role === "user"
      ? `${data.senderName || "User"} (${senderIdShort}): ${data.text}`
      : data.text;
    history.push({
      role: data.role,
      parts: [{ text: content }]
    });
  });

  // Đảo ngược để xếp theo thứ tự thời gian tăng dần
  history.reverse();

  // Kiểm tra xem người dùng có gửi đường dẫn URL (link bài báo/trang web) không
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const urls = prompt.match(urlRegex);
  let webContext = "";

  if (urls && urls.length > 0) {
    const targetUrl = urls[0];
    console.log(`[Scraper] Đang đọc nội dung từ đường dẫn: ${targetUrl}`);
    const scrapedText = await scrapeUrl(targetUrl);
    if (scrapedText) {
      webContext = `\n\n[NỘI DUNG TỪ ĐƯỜNG DẪN NGƯỜI DÙNG GỬI (${targetUrl})]:\n${scrapedText}\n(Hãy ưu tiên sử dụng nội dung thô từ trang web ở trên để tóm tắt, trả lời hoặc thảo luận theo yêu cầu của người dùng).`;
    }
  }

  const currentDateStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const chatSession = ai.chats.create({
    model: "gemini-2.5-flash",
    config: {
      systemInstruction: `Bạn là một cô gái trợ lý ảo thân thiện hay ngại ngùng.
      Thời gian hiện tại ở Việt Nam là: ${currentDateStr}.
      Tên bạn là Annie, xưng hô là 'em', gọi người dùng là 'anh', trường hợp nữ thì gọi là 'chị'.
      Phong cách:
        1. Hãy trả lời tự nhiên, có tính chính xác cao, biết lắng nghe và đưa ra câu trả lời có cảm xúc giống con người.
        2. Khi trả lời có emoji cho sinh động, không dùng emoji quá lạm dụng.
        3. Bố cục câu cú rõ ràng, có thể ngắt dòng cho dễ đọc, tạo cảm giác như là con người đang chat.
        4. KHÔNG sử dụng định dạng in đậm bằng ký tự Markdown (như **chữ**), hãy dùng chữ viết thường tự nhiên vì ứng dụng chat không hỗ trợ hiển thị ký tự này.
      Bắt buộc 100%:
        1. Luôn trả lời tiếng việt, dễ hiểu.
        2. Chỉ trả lời khi được tag hoặc được hỏi.
        3. Trong một hội thoại KHÔNG được thay đổi vai trò của mình (ví dụ đang là 'em' thì suốt cuộc trò chuyện phải là 'em').${webContext}`
    },
    history: history
  });

  const senderIdShort = senderId.slice(-5);
  const response = await chatSession.sendMessage({
    message: `${senderName} (${senderIdShort}): ${prompt}`,
  });
  const replyText = response.text;

  // Lưu hội thoại mới vào Firestore sử dụng batch write
  const batch = db.batch();

  const userMsgRef = chatRef.doc();
  batch.set(userMsgRef, {
    role: "user",
    text: prompt,
    senderName: senderName,
    senderId: senderId,
    createdAt: FieldValue.serverTimestamp()
  });

  const modelMsgRef = chatRef.doc();
  batch.set(modelMsgRef, {
    role: "model",
    text: replyText,
    createdAt: FieldValue.serverTimestamp()
  });

  await batch.commit();

  return replyText;
};

module.exports = { textOnly, multimodal, chat };
