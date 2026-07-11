const axios = require("axios");
const { db, FieldValue, getUserProfile, getRawMessages } = require("./db");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = (webContext = "", groupContext = "", isGroup = false) => {
  const pad = (n) => String(n).padStart(2, '0');
  const vnDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const now = `${pad(vnDate.getHours())}:${pad(vnDate.getMinutes())} ${pad(vnDate.getDate())}/${pad(vnDate.getMonth() + 1)}/${vnDate.getFullYear()}`;
  const currentYear = vnDate.getFullYear();
  const brevityRule = isGroup
    ? "TỐI GIẢN & SÚC TÍCH: VÀO ĐỀ LUÔN, trả lời TRỰC TIẾP. TỐI ĐA 10 CÂU cho mỗi lần trả lời. TUYỆT ĐỐI KHÔNG lặp lại câu hỏi của User. Mọi nội dung giải thích đều phải cực kỳ ngắn gọn."
    : "VÀO ĐỀ LUÔN, trả lời TRỰC TIẾP. TUYỆT ĐỐI KHÔNG lặp lại câu hỏi của User. Cung cấp thông tin đầy đủ, chi tiết và tận tình.";

  return `Role: Annie (nữ trợ lý thông minh, ngoan), xưng "em", gọi "anh/chị".
  Style: Tự nhiên, gần gũi. BẮT BUỘC dùng RẤT NHIỀU emoji (có thể dùng thêm ascii art/bảng biểu nếu cần). CẤM trả về định dạng markdown. Chỉ @tên khi khẩn.
  Rules:
  1. Thời gian: ${now}. Chỉ đáp tin [NEW]. CẤM xin lỗi. TRỪ KHI User chỉ định rõ năm trong quá khứ, MẶC ĐỊNH mọi sự kiện đều thuộc năm ${currentYear} trở đi, TUYỆT ĐỐI KHÔNG lấy data cũ để tự suy diễn.
  2. Logic & Data: CHỈ trả lời tin tức/sự kiện DỰA VÀO [THÔNG TIN TỪ INTERNET]. NẾU không có dữ liệu hoặc không khớp, BẮT BUỘC báo "em chưa có thông tin chính xác", TUYỆT ĐỐI KHÔNG tự bịa data. Luôn ĐỐI CHIẾU mốc thời gian trên để suy luận trạng thái (chưa/đang/đã diễn ra).
  3. Profile: NẾU User tiết lộ thông tin mới, chèn: <PROFILE userId="ID" real_name="Tên" gender="nam/nu" public_traits="..." private_traits="..."> ở cuối (chỉ lấy từ lời User).
  4. QUICK REPLIES: NẾU cần hỏi lại User để làm rõ ý (VD: giải đấu nào?), BẮT BUỘC chèn 2-3 gợi ý ở cuối câu theo ĐÚNG định dạng: [TAGS: Gợi ý 1 | Gợi ý 2]. VÍ DỤ: [TAGS: Tên Giải Đấu 1 | Tên Giải Đấu 2 | Giải khác]. CẤM dùng TAGS cho câu hỏi giao tiếp.
  5. Topic: NẾU đổi chủ đề, chèn: <TOPIC>Tên Chủ Đề</TOPIC> ở cuối.
  ${brevityRule}${webContext}${groupContext}`
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

// Các mẫu câu hỏi thuần thời gian — trả lời bằng JS, không tốn bất kỳ API nào
const PURE_TIME_PATTERNS = [
  /^(bây giờ |bay gio |bây giờ là |bay gio la )?(mấy giờ|bao nhiêu giờ|mấy gi)(\s+rồi)?[?!.\s]*$/i,
  /^giờ mấy( rồi)?[?!.\s]*$/i,
  /^(hôm nay |hum nay )?(là )?(ngày mấy|mấy ngày)( rồi)?[?!.\s]*$/i,
  /^ngày mấy rồi[?!.\s]*$/i,
];

const buildTimeReply = () => {
  const pad = (n) => String(n).padStart(2, '0');
  const vnDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[vnDate.getDay()];
  const time = `${pad(vnDate.getHours())}:${pad(vnDate.getMinutes())}`;
  const date = `${pad(vnDate.getDate())}/${pad(vnDate.getMonth() + 1)}/${vnDate.getFullYear()}`;
  return `Dạ, bây giờ là ${time}, ngày ${date} (${dayName}) ạ! ⏰`;
};

const chat = async (sessionId, prompt, senderName = "User", senderId = "unknown", lineMessageId = null, quoteContext = "", forceIgnoreCheck = false, groupContext = "", isGroup = false, hotTopic = "") => {
  // ★ Fast path: Câu hỏi thuần thời gian — trả lời bằng JS, không gọi bất kỳ API nào
  const cleanPrompt = prompt.replace(/@[^\s]+/g, "").trim();
  if (PURE_TIME_PATTERNS.some(p => p.test(cleanPrompt))) {
    console.log(`[DeepSeek] Fast path: Câu hỏi thời gian — trả lời JS không gọi API`);
    return buildTimeReply();
  }

  const sessionRef = db.collection("users").doc(sessionId);
  const sessionDoc = await sessionRef.get();
  const sessionData = sessionDoc.data() || {};
  const summariesArray = sessionData.summaries || [];
  const messagesArray = await getRawMessages(sessionId, 20);

  const history = [];

  // Nạp các bản tóm tắt quá khứ vào đầu lịch sử
  if (summariesArray.length > 0) {
    const combinedSummaries = summariesArray.map(s => s.text).join("\n\n");
    history.push({
      role: "system",
      content: `[BỘ NHỚ DÀI HẠN (TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ)]:\n${combinedSummaries}`
    });
  }

  // Tải các tin nhắn thô chưa được tóm tắt
  messagesArray.forEach(msg => {
    const { role, text, senderName: name } = msg;
    const apiRole = role === "model" ? "assistant" : role;
    const content = apiRole === "user" ? `[${name || "User"}]: ${text}` : text;
    history.push({ role: apiRole, content });
  });

  // 2. Lấy ngữ cảnh web (scrape URL hoặc Tavily search nếu cần)
  let webContext = "";
  try {
    let searchPrompt = quoteContext ? `${quoteContext}${prompt}` : prompt;

    // Heuristic bù đắp ngữ cảnh tìm kiếm
    let contextualSearchPrompt = searchPrompt;
    if (searchPrompt.split(" ").length < 15) {
      if (messagesArray && messagesArray.length > 0) {
        const prevUserMsgs = messagesArray.filter(m => m.role === "user");
        if (prevUserMsgs.length > 0) {
          const lastUserMsg = prevUserMsgs[prevUserMsgs.length - 1].text;
          // Tránh duplicate: chỉ bù đắp nếu lastUserMsg khác hẳn so với prompt hiện tại
          const isSameAsCurrentPrompt = lastUserMsg.trim().toLowerCase() === searchPrompt.trim().toLowerCase();
          if (!isSameAsCurrentPrompt) {
            contextualSearchPrompt = `${hotTopic ? hotTopic + ". " : ""}${lastUserMsg}. ${searchPrompt}`;
            console.log(`[DeepSeek] Bù đắp ngữ cảnh (Tầng 1+2): "${contextualSearchPrompt}"`);
          }
        }
      } else if (hotTopic) {
        contextualSearchPrompt = `${hotTopic}. ${searchPrompt}`;
        console.log(`[DeepSeek] Bù đắp ngữ cảnh (Tầng 2): "${contextualSearchPrompt}"`);
      }
    }

    webContext = await resolveWebContext(contextualSearchPrompt, sessionId);
    console.log(`[DeepSeek] webContext có nội dung: ${webContext.length > 0}`);
  } catch (err) {
    console.error("[DeepSeek] resolveWebContext lỗi:", err.message);
  }

  // 3. Build message list
  // Đưa quoteContext vào userContent để gửi sang API, tránh lưu quoteContext vào DB làm rác lịch sử
  const userContent = `[NEW] [${senderName}]: ${quoteContext || ""}${prompt}`;

  history.unshift({ role: "system", content: buildSystemPrompt(webContext, groupContext, isGroup) });
  let sysContent = history[0].content;
  if (forceIgnoreCheck) {
    sysContent += "\n\nBẮT BUỘC: Bạn đang ở trong group chat. Người dùng có thể chỉ vô tình nhắc tên bạn khi nói chuyện với người khác. BẠN PHẢI đánh giá xem họ CÓ THỰC SỰ ĐANG NÓI CHUYỆN VỚI BẠN HAY KHÔNG. Nếu họ ĐANG NÓI VỚI NGƯỜI KHÁC (nhắc bạn ở ngôi thứ 3), BẠN PHẢI trả lời chính xác bằng 1 chữ: IGNORE. Tuyệt đối không giải thích thêm. Nếu họ đang hỏi hoặc gọi bạn, hãy trả lời bình thường.";
  }
  history[0].content = sysContent;

  const messages = [
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

const { multimodal, analyzeDocument, summarizeHistory } = require("./gemini");

module.exports = { chat, multimodal, analyzeDocument, summarizeHistory };

// force deploy hash: Thu Jul  9 23:21:53 +07 2026
// force hash: Thu Jul  9 23:27:53 +07 2026
// force hash: Thu Jul  9 23:36:47 +07 2026
// force hash: Thu Jul  9 23:45:13 +07 2026
// force hash: Thu Jul  9 23:57:26 +07 2026
// optimize: Fri Jul 10 08:21:56 +07 2026
