const axios = require("axios");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { searchWeb, scrapeUrl } = require("./search");

if (admin.apps.length === 0) {
  admin.initializeApp();
}
const db = admin.firestore();

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

const textOnly = async (prompt) => {
  const systemInstruction = "Bạn là một trợ lý ảo cực kỳ thân thiện, vui vẻ, xưng hô thân mật là 'mình' và gọi người dùng là 'bạn'. Hãy trả lời tự nhiên, gần gũi như một người bạn thực sự và ưu tiên sử dụng tiếng Việt";
  try {
    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
        }
      }
    );
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("DeepSeek API Error (textOnly):", error?.response?.data || error.message);
    throw error;
  }
};

const chat = async (sessionId, prompt) => {
  const chatRef = db.collection("users").doc(sessionId).collection("history");

  // 1. Lấy 10 tin nhắn gần nhất từ Firestore
  const snapshot = await chatRef.orderBy("createdAt", "desc").limit(20).get();

  const history = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    // Chuyển role 'model' của Gemini thành 'assistant' để khớp với API của DeepSeek
    const role = data.role === "model" ? "assistant" : data.role;
    history.push({
      role: role,
      content: data.text
    });
  });

  // Đảo ngược để xếp theo thứ tự thời gian tăng dần
  history.reverse();

  // 2. Kiểm tra xem người dùng có gửi đường dẫn URL (link bài báo/trang web) không
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
  } else {
    // Nếu không gửi URL trực tiếp, kiểm tra nhu cầu tìm kiếm trên Internet bằng Tavily
    const searchKeywords = ["tìm", "tra cứu", "search", "giá", "thời tiết", "tin tức", "hôm nay", "mới nhất", "tỷ giá", "kết quả", "ai là", "thế nào", "lịch", "bao nhiêu", "là gì", "ở đâu", "ngày", "đêm", "tại sao", "dự đoán", "triệu chứng", "thuốc", "xổ số", "vàng", "kqxs"];
    const needsSearch = searchKeywords.some(keyword => prompt.toLowerCase().includes(keyword));

    if (needsSearch) {
      // Làm sạch câu lệnh: Xóa các tag bot (@name) để tránh làm nhiễu kết quả tìm kiếm
      const cleanQuery = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();
      console.log(`[Tavily Search] Đang tìm kiếm thông cho: "${cleanQuery}"`);
      const searchResult = await searchWeb(cleanQuery);
      if (searchResult) {
        webContext = `\n\n[THÔNG TIN THỜI GIAN THỰC TỪ INTERNET]\n${searchResult}\n(Hãy sử dụng nguồn thông tin trên mạng này để trả lời chính xác câu hỏi của người dùng nếu liên quan).`;
      }
    }
  }

  // 3. Tạo chỉ dẫn hệ thống cùng ngày giờ hiện tại và ngữ cảnh tìm kiếm/đọc web
  const currentDateStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const systemInstruction = `Bạn là một cô gái trợ lý ảo thân thiện hay ngại ngùng.
  Thời gian hiện tại ở Việt Nam là: ${currentDateStr}.
  Tên bạn là Annie, xưng hô là 'em', gọi người dùng là 'anh', trường hợp nữ thì gọi là 'chị'.
  Phong cách:
    1. Hãy trả lời tự nhiên, có tính chính xác cao, biết lắng nghe và đưa ra câu trả lời có cảm xúc giống con người
    2. Khi trả lời có emoji cho sinh động, không dùng emoji quá lạm dụng
    3. Bố cục câu cú rõ ràng, có thể ngắt dòng cho dễ đọc, tạo cảm giác như là con người đang chat
  Bắt buộc 100%:
    1. Luôn trả lời tiếng việt, dễ hiểu.
    2. Chỉ trả lời khi được tag hoặc được hỏi.
    3. Trong một hội thoại KHÔNG được thay đổi vai trò của mình (ví dụ đang là 'em' thì suốt cuộc trò chuyện phải là 'em').${webContext}`;

  const messages = [
    { role: "system", content: systemInstruction },
    ...history,
    { role: "user", content: prompt }
  ];

  try {
    // 3. Gọi DeepSeek API qua axios
    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: messages
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`
        }
      }
    );

    const replyText = response.data.choices[0].message.content;

    // 4. Lưu hội thoại mới vào Firestore sử dụng batch write
    const batch = db.batch();

    const userMsgRef = chatRef.doc();
    batch.set(userMsgRef, {
      role: "user",
      text: prompt,
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
  } catch (error) {
    console.error("DeepSeek API Error (chat):", error?.response?.data || error.message);
    throw error;
  }
};

module.exports = { textOnly, chat };
