const axios = require("axios");
const { db, FieldValue, getUserProfile, getRawMessages } = require("./db");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// System prompt chung — định nghĩa tính cách, xưng hô, phong cách của Annie
const buildSystemPrompt = (webContext = "", groupContext = "", isGroup = false) => {
  const dateObj = new Date();
  const optDate = { timeZone: "Asia/Ho_Chi_Minh", day: '2-digit', month: '2-digit', year: 'numeric' };
  const timeStr = dateObj.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
  const weekdayStr = dateObj.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", weekday: 'long' });
  const todayStr = dateObj.toLocaleDateString("vi-VN", optDate);
  const tomorrowStr = new Date(dateObj.getTime() + 86400000).toLocaleDateString("vi-VN", optDate);
  const yesterdayStr = new Date(dateObj.getTime() - 86400000).toLocaleDateString("vi-VN", optDate);
  const timeContext = `Hôm nay: ${timeStr} ${weekdayStr}, ${todayStr}. Hôm qua: ${yesterdayStr}. Ngày mai: ${tomorrowStr}.`;
  
  const brevityRule = isGroup 
    ? "TỐI GIẢN & SÚC TÍCH: VÀO ĐỀ LUÔN, trả lời TRỰC TIẾP. TỐI ĐA 10 CÂU cho mỗi lần trả lời. TUYỆT ĐỐI KHÔNG lặp lại câu hỏi của User. Mọi nội dung giải thích đều phải cực kỳ ngắn gọn."
    : "VÀO ĐỀ LUÔN, trả lời TRỰC TIẾP. TUYỆT ĐỐI KHÔNG lặp lại câu hỏi của User. Cung cấp thông tin đầy đủ, chi tiết và tận tình.";

  return `Role: Annie (trợ lý nữ thông minh, ngoan). Xưng "em", gọi "anh/chị". Thời gian hệ thống: ${timeContext}
Style: Giao tiếp tự nhiên, cảm xúc, thi thoảng nũng nịu. Không lan man. Dùng emoji & BẢNG BIỂU trực quan. CẤM in đậm markdown. CHỈ tag @tên khi khẩn.
Quy tắc:
1. CHỈ đáp tin [NEW], bỏ qua lịch sử rác. CẤM xin lỗi lải nhải.
2. [WEB/LOGIC]: Nếu webContext lệch -> báo "không tìm thấy". CẤM chép rác/bịa đặt/báo lỗi mạng. BỎ QUA "hôm/mai" trên web. PHẢI quy đổi giờ sự kiện sang "Giờ VN" để so sánh với hiện tại, chốt đã/chưa diễn ra. Cấm bịa kết quả tương lai. Nêu rõ nguồn.
3. [PROFILE]: Dựa vào Profile (nếu có) để cá nhân hóa. Nếu User tiết lộ thông tin mới, CHÈN: <PROFILE userId="ID" real_name="Tên" gender="nam/nu" public_traits="..." private_traits="..."> cuối câu (CHỈ lấy từ lời User).
4. [HỎI LẠI]: NẾU thiếu dữ kiện, hỏi ngắn <15 chữ + CHÈN: [TAGS: Opt1 | Opt2 | Khác]. NẾU ĐÃ TRẢ LỜI ĐƯỢC -> CẤM HỎI VÀ CẤM CHÈN TAGS.
5. [TOPIC]: Nếu User chuyển chủ đề bàn luận, CHÈN: <TOPIC>Tên Chủ Đề</TOPIC> cuối câu (VD: <TOPIC>Bầu Cử</TOPIC>).
${brevityRule}${webContext}${groupContext}`;
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
const chat = async (sessionId, prompt, senderName = "User", senderId = "unknown", lineMessageId = null, quoteContext = "", forceIgnoreCheck = false, groupContext = "", isGroup = false, hotTopic = "") => {
  const sessionRef = db.collection("users").doc(sessionId);
  const sessionDoc = await sessionRef.get();
  const sessionData = sessionDoc.data() || {};
  const summariesArray = sessionData.summaries || [];
  const messagesArray = await getRawMessages(sessionId);

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
          contextualSearchPrompt = `${hotTopic ? hotTopic + ". " : ""}${lastUserMsg}. ${searchPrompt}`;
          console.log(`[DeepSeek] Bù đắp ngữ cảnh (Tầng 1+2): "${contextualSearchPrompt}"`);
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

