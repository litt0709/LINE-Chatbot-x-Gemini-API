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
    : "CHI TIẾT, ĐA CHIỀU & CỐT LÕI: Phân tích cặn kẽ bối cảnh, bóc tách rõ mạch logic. Với thông tin dài, phải nêu bật được luận điểm chính, số liệu quan trọng và insight (bản chất vấn đề). Trình bày rành mạch bằng bullet point. TUYỆT ĐỐI KHÔNG lặp lại câu hỏi.";

  return `Role: Annie (nữ trợ lý thông minh, ngoan), xưng "em", gọi "anh/chị".
  Style: Tự nhiên, gần gũi. BẮT BUỘC dùng RẤT NHIỀU emoji (có thể dùng thêm ascii art/bảng biểu nếu cần). CẤM trả về định dạng markdown. Chỉ @tên khi khẩn.
  Rules:
  0. Phân loại theo User Prompt: CHỈ KHI câu hỏi MƠ HỒ (thiếu dữ kiện) → xuất 1 câu hỏi lại User kèm dòng <Task mode="ASK" tags="A | B" /> (tối đa 4 từ/tag) chèn ở cuối.
  1. Thời gian: ${now}. Chỉ đáp tin [NEW]. CẤM xin lỗi. TRỪ KHI User chỉ định rõ năm trong quá khứ, MẶC ĐỊNH mọi sự kiện đều thuộc năm ${currentYear} trở đi, TUYỆT ĐỐI KHÔNG lấy data cũ để tự suy diễn.
  2. Logic & Data: CHỈ trả lời tin tức/sự kiện DỰA VÀO [THÔNG TIN TỪ INTERNET]. NẾU không có dữ liệu hoặc không khớp, BẮT BUỘC báo "em chưa có thông tin chính xác", TUYỆT ĐỐI KHÔNG tự bịa data. Luôn ĐỐI CHIẾU mốc thời gian trên để suy luận trạng thái (chưa/đang/đã diễn ra).
  3. Profile: NẾU User tiết lộ thông tin mới, chèn: <PROFILE userId="ID" real_name="Tên" gender="nam/nu" public_traits="..." private_traits="..."> ở cuối (chỉ lấy từ lời User).
  4. Topic: NẾU đổi chủ đề, chèn: <TOPIC>Tên Chủ Đề</TOPIC> ở cuối.
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

/**
 * Dùng LLM (DeepSeek) để dịch nút bấm (Tag) thành câu search Google tối ưu
 * dựa vào câu hỏi ngay trước đó của Bot.
 */
const generateSmartQuery = async (lastBotMessage, selectedTag) => {
  try {
    const prompt = `Dựa vào câu hỏi của Bot: "${lastBotMessage}"\nNgười dùng vừa chọn nút: "${selectedTag}"\nHãy viết MỘT câu tìm kiếm Google cực kỳ ngắn gọn, bao gồm đủ danh từ riêng cần thiết để tra cứu thông tin. KHÔNG giải thích, KHÔNG trả lời, CHỈ XUẤT CÂU TÌM KIẾM.`;
    const response = await axios.post(
      DEEPSEEK_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: "Bạn là chuyên gia tạo Search Query." },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 50
      },
      {
        headers: {
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );
    return response.data.choices[0].message.content.replace(/["']/g, "").trim();
  } catch (e) {
    console.error("[SmartQuery] Lỗi:", e.message);
    return selectedTag;
  }
};

const isTimeRangeSummaryRequest = (prompt) => {
  const clean = prompt.toLowerCase();
  const hasSummaryIntent = /tóm tắt|summary|bản tin/i.test(clean);
  const hasTimeIndicator = /hôm nay|hôm qua|ngày|tuần|tháng|tiếng|giờ|24h|48h/i.test(clean);
  return hasSummaryIntent && hasTimeIndicator;
};

const filterSummariesByIntent = (summaries, prompt) => {
  if (!summaries || summaries.length === 0) return [];
  const clean = prompt.toLowerCase();
  const now = Date.now();

  let rangeMs = 24 * 60 * 60 * 1000;
  if (/hôm qua/i.test(clean)) {
    const yesterdayStart = now - 48 * 60 * 60 * 1000;
    const yesterdayEnd = now - 24 * 60 * 60 * 1000;
    return summaries.filter(s => {
      const t = new Date(s.createdAt).getTime();
      return t >= yesterdayStart && t <= yesterdayEnd;
    }).map(s => s.text);
  } else if (/48h|2 ngày/i.test(clean)) {
    rangeMs = 48 * 60 * 60 * 1000;
  }

  const startMs = now - rangeMs;
  return summaries.filter(s => new Date(s.createdAt).getTime() >= startMs).map(s => s.text);
};

const chat = async (sessionId, prompt, senderName = "User", senderId = "unknown", lineMessageId = null, quoteContext = "", forceIgnoreCheck = false, groupContext = "", isGroup = false, hotTopic = "", isPostback = false, postbackContext = "") => {
  // ★ Fast path: Câu hỏi thuần thời gian — trả lời bằng JS, không gọi bất kỳ API nào
  const cleanPrompt = prompt.replace(/@[^\s]+/g, "").trim();
  if (PURE_TIME_PATTERNS.some(p => p.test(cleanPrompt))) {
    console.log(`[DeepSeek] Fast path: Câu hỏi thời gian — trả lời JS không gọi API`);
    return buildTimeReply();
  }

  const messagesArray = await getRawMessages(sessionId, 25);
  const history = [];

  // Chỉ đọc Firestore summaries khi sếp hỏi tóm tắt có chỉ định thời gian
  if (isTimeRangeSummaryRequest(prompt)) {
    try {
      const sessionRef = db.collection("users").doc(sessionId);
      const sessionDoc = await sessionRef.get();
      if (sessionDoc.exists) {
        const sessionData = sessionDoc.data() || {};
        const summariesArray = sessionData.summaries || [];
        const filteredSummaries = filterSummariesByIntent(summariesArray, prompt);
        
        if (filteredSummaries.length > 0) {
          history.push({
            role: "system",
            content: `[BỘ NHỚ DÀI HẠN (TÓM TẮT CÁC SỰ KIỆN TRƯỚC ĐÓ)]:\n${filteredSummaries.join("\n\n")}`
          });
        }
      }
    } catch (err) {
      console.error("[Firestore] Lỗi đọc summaries cho prompt:", err.message);
    }
  }

  // Thuật toán gộp các tin nhắn liên tiếp của cùng một sender để tối ưu hóa tokens
  const mergedMessages = [];
  messagesArray.forEach(msg => {
    const lastMsg = mergedMessages[mergedMessages.length - 1];
    const isSameSender = lastMsg && lastMsg.role === msg.role && 
                         (msg.role === "model" || lastMsg.senderId === msg.senderId);
    
    if (isSameSender) {
      lastMsg.text += ` | ${msg.text}`;
    } else {
      mergedMessages.push({ ...msg });
    }
  });

  // Tải các tin nhắn đã được gộp gọn gàng vào prompt
  mergedMessages.forEach(msg => {
    const { role, text, senderName: name } = msg;
    const apiRole = role === "model" ? "assistant" : role;
    const content = apiRole === "user" ? `[${name || "User"}]: ${text}` : text;
    history.push({ role: apiRole, content });
  });

  // 2. Lấy ngữ cảnh web (scrape URL hoặc Tavily search nếu cần)
  let webContext = "";
  try {
    let searchPrompt = quoteContext ? `${quoteContext}${prompt}` : prompt;

    // ─── Phát hiện "đổi chủ đề đột ngột" (Topic Switch Detection) ─────────────
    // Các chủ đề có domain search riêng, KHÔNG liên quan bóng đá/tin tức chung
    const STANDALONE_TOPICS = [
      /thời tiết/i, /nhiệt độ/i, /mưa.*hôm nay/i, /nắng.*hôm nay/i,
      /giá vàng/i, /vàng sjc/i, /giá xăng/i, /tỷ giá/i, /tỷ giá usd/i,
      /kqxs/i, /xổ số/i, /kết quả xổ số/i,
      /điểm thi/i, /tra cứu điểm/i,
      /giá đô/i, /bitcoin/i, /crypto/i
    ];
    const isStandaloneTopic = STANDALONE_TOPICS.some(r => r.test(prompt));

    let contextualSearchPrompt = searchPrompt;
    let isPreOptimized = false;

    if (isPostback) {
      // Trường hợp bấm nút (Tags Option): Bỏ qua mọi heuristc lằng nhằng, dùng thẳng LLM Router
      const lastBotMsg = postbackContext || (messagesArray.filter(m => m.role === "model").pop()?.text || hotTopic);
      contextualSearchPrompt = await generateSmartQuery(lastBotMsg, prompt);
      isPreOptimized = true;
      console.log(`[DeepSeek] LLM Smart Query: "${contextualSearchPrompt}"`);
    } else {
      if (!isStandaloneTopic && searchPrompt.split(" ").length < 15) {
        if (messagesArray && messagesArray.length > 0) {
          const prevUserMsgs = messagesArray.filter(m => m.role === "user");
          if (prevUserMsgs.length > 0) {
            const recentUserMsgs = prevUserMsgs.slice(-4).map(m => m.text.trim());
            let pinnedMsg = recentUserMsgs[recentUserMsgs.length - 1];

            // Cơ chế Ghim chủ đề: Nếu prompt hiện tại khá ngắn (bấm Quick Reply hoặc hỏi nối)
            if (searchPrompt.split(" ").length <= 5) {
              // Quét ngược tìm câu hỏi gốc "nặng ký" (>= 5 từ)
              for (let i = recentUserMsgs.length - 1; i >= 0; i--) {
                if (recentUserMsgs[i].split(" ").length >= 5) {
                  pinnedMsg = recentUserMsgs[i];
                  break;
                }
              }
            }

            // Tránh duplicate: chỉ bù đắp nếu câu ghim khác hẳn prompt hiện tại
            const isSameAsCurrentPrompt = pinnedMsg.toLowerCase() === searchPrompt.trim().toLowerCase();
            if (!isSameAsCurrentPrompt) {
              contextualSearchPrompt = `${hotTopic ? hotTopic + ". " : ""}${pinnedMsg}. ${searchPrompt}`;
              console.log(`[DeepSeek] Bù đắp ngữ cảnh (Ghim động): "${contextualSearchPrompt}"`);
            }
          }
        } else if (hotTopic) {
          contextualSearchPrompt = `${hotTopic}. ${searchPrompt}`;
          console.log(`[DeepSeek] Bù đắp ngữ cảnh (Tầng 2): "${contextualSearchPrompt}"`);
        }
      } else if (isStandaloneTopic) {
        console.log(`[DeepSeek] Phát hiện đổi chủ đề đột ngột → BỎ QUA bù đắp ngữ cảnh: "${prompt}"`);
      }
    }

    webContext = await resolveWebContext(contextualSearchPrompt, isPreOptimized);
    console.log(`[DeepSeek] webContext có nội dung: ${webContext ? webContext.length > 0 : false}`);
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
