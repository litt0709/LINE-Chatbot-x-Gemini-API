const { searchTavily, TODAY_KEYWORDS } = require("./tavily");
const { searchExa } = require("./exa");
const { getBotConfig } = require("./configCache");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

let stopWordsList = [
  "ngay", "nam", "thoi", "tiet", "lich", "thi", "dau", "cho", "xin", "em", "oi", "cai", "nay", "voi", "anh", "chi", "la", "gi", "ai", "xem", "tin", "tuc", "moi", "nhat", "hot", "sao", "va", "cua"
];

try {
  const stopWordsPath = path.join(__dirname, "stopwords.json");
  if (fs.existsSync(stopWordsPath)) {
    stopWordsList = JSON.parse(fs.readFileSync(stopWordsPath, "utf8"));
  }
} catch (err) {
  console.error("[Search Router] Lỗi nạp stopwords.json:", err.message);
}

/**
 * Trích xuất từ khóa tìm kiếm (Dùng Regex nội bộ thay vì LLM để giảm độ trễ).
 * @param {string} contextualPrompt - Câu nói đã được bù đắp ngữ cảnh
 * @returns {Promise<{query: string, has_entity: boolean}>}
 */
const extractSearchQuery = async (contextualPrompt) => {
  // 1. Loại bỏ dấu câu trước để tránh cản trở ranh giới từ của các từ rác
  let query = contextualPrompt.replace(/[.,?!]/g, " ").replace(/\s+/g, ' ').trim();

  // 2. Bộ từ rác (noise words) và chỉ thị tìm kiếm để làm sạch truy vấn
  const noiseWords = [
    "annie ơi", "annie", "bot ơi", "bot", "cho anh hỏi", "cho em hỏi", "cho mình hỏi", "hỏi xíu",
    "tìm kiếm", "tìm giúp", "tìm giùm", "tra cứu", "tra giúp", "tra giùm", "xem giúp", "xem giùm", "giúp anh", "giúp em",
    "cho anh", "cho em", "cho chị", "cho mình", "với", "nhé", "nha", "đi", "ạ", "ơi",
    "chưa em", "chưa anh", "nhỉ", "có trận nào", "có ai", "có...không", "có...chưa",
    "thế nào", "ra sao", "chi tiết hơn", "thông tin", "kể về", "biết gì", "nào",
    "tổng hợp", "đánh giá", "về nhân vật", "về", "được cho là", "làm việc tại", "làm việc", "tin đồn", "tin tức về", "và"
  ];
  
  for (const word of noiseWords) {
    // Sử dụng bộ lọc khoảng trắng ranh giới an toàn cho ký tự Unicode thay thế cho \b
    query = query.replace(new RegExp(`(?:^|\\s)${word}(?:$|\\s)`, 'gi'), " ");
  }
  
  // 3. Làm sạch khoảng trắng thừa
  query = query.replace(/\s+/g, ' ').trim();

  // Fallback nếu xóa xong rỗng
  if (!query) query = contextualPrompt.replace(/[.,?!]/g, " ").replace(/\s+/g, ' ').trim();

  // Nhận diện có cần search không (thay thế cho LLM has_entity)
  // Check viết hoa (Bỏ qua ký tự đầu tiên của câu)
  const hasCapitalized = /[A-ZĐ]/.test(query.substring(1));
  
  // Check các từ khóa đặc biệt
  const specialKeywords = ["lịch", "tỷ số", "tỉ số", "kết quả", "kqxs", "giá", "thời tiết", "bóng đá", "tứ kết", "bán kết", "chung kết", "trận", "tin tức", "điểm thi", "bầu cử", "chứng khoán", "vàng sjc"];
  const hasSpecial = specialKeywords.some(kw => query.toLowerCase().includes(kw));

  // Chấp nhận has_entity nếu có chữ viết hoa, từ khóa đặc biệt, hoặc cụm từ tìm kiếm từ 2 từ trở lên
  const has_entity = hasCapitalized || hasSpecial || query.split(/\s+/).filter(w => w.length > 0).length >= 2;
  
  console.log(`[Regex Extractor] Original: "${contextualPrompt}" -> Extracted: "${query}", has_entity: ${has_entity}`);
  
  return { query, has_entity };
};

// ─── Regex lọc URL ───────────────────────────────────────────────────────────
const URL_REGEX = /(https?:\/\/[^\s"'>\]]+)/gi;

// ─── Từ khóa nhận diện câu hỏi cần search ───────────────────────────────────
const SEARCH_KEYWORDS = [
  "tìm", "tra cứu", "search", "giá", "thời tiết", "tin tức", "hôm nay", "hum nay", "nay", "mới nhất",
  "tỷ giá", "kết quả", "lịch", "bao nhiêu", "ngày", "đêm", "triệu chứng", "thuốc",
  "xổ số", "vàng", "kqxs", "cập nhật", "recent", "news", "latest", "bóng đá", "hôm qua",
  "đá lúc mấy giờ", "chiếu kênh nào", "bản đồ", "địa chỉ", "giá xăng", "đăng ký",
  "mua ở đâu", "tại sao", "như thế nào", "là ai", "là cái gì", "là gì",
  "đội", "trận", "thắng", "thua", "vô địch", "bàn thắng", "ghi bàn", "tỉ số",
  "lỗi", "sập", "outage", "bảo trì", "không vào được", "lag", "disconnect",
  "tin hot", "fact check", "kiểm chứng", "sự thật", "tin chuẩn", "tin thật",
  "thông tin", "tổng hợp", "chi tiết", "chi tiế", "tiểu sử", "tác giả", "scandal", "drama", "phốt", "hướng dẫn",
  "vàng sjc", "bầu cử", "tổng thống mỹ", "thị trường chứng khoán", "chứng khoán"
];

// ─── Mẫu câu hỏi về giờ/ngày hiện tại — KHAI KHÔNG search (bot tự biết từ system prompt) ───
const SKIP_SEARCH_PATTERNS = [
  /bây giờ (là )?(mấy giờ|ngày mấy)/i,
  /mấy giờ rồi/i, /giờ mấy rồi/i,
  /hôm nay là ngày mấy/i, /ngày mấy rồi/i,
  /bây giờ là bao nhiêu giờ/i,
  /ngủ/i
];

const QUESTION_PATTERNS = [
  /ai là/i, /cái gì/i, /ở đâu/i, /khi nào/i,
  /thế nào/i, /như thế nào/i, /làm sao để/i, /hướng dẫn cách/i,
  /thì sao/i, /còn.+không/i, /cho hỏi/i, /biết gì về/i, /kể về/i
];

/**
 * Kiểm tra offline xem câu hỏi có cần tìm kiếm Internet không.
 * Synchronous, phản hồi tức thì — không gọi API nào bên ngoài.
 * @param {string} prompt
 * @returns {boolean}
 */
const checkNeedsSearch = (prompt) => {
  const query = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!query) return false;
  // Ưu tiên bỏ qua trước: câu hỏi thời gian hiện tại bot tự biết, không cần search
  if (SKIP_SEARCH_PATTERNS.some(p => p.test(query))) {
    console.log(`[Search Router] Bỏ qua search (câu hỏi thời gian hiện tại): "${query}"`);
    return false;
  }
  if (SEARCH_KEYWORDS.some(kw => query.includes(kw))) {
    console.log(`[Search Router] Khớp từ khóa → cần search: "${query}"`);
    return true;
  }
  if (QUESTION_PATTERNS.some(p => p.test(query))) {
    console.log(`[Search Router] Khớp regex → cần search: "${query}"`);
    return true;
  }
  console.log(`[Search Router] Không cần search: "${query}"`);
  return false;
};

/**
 * Tải và trích xuất nội dung văn bản thuần từ một URL.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
const scrapeUrl = async (url) => {
  if (url.includes("x.com/") || url.includes("twitter.com/")) {
    return "[Hệ thống: Tường lửa đã chặn bot đọc link X/Twitter. Cần báo lỗi không thể đọc cho User.]";
  }
  const axios = require("axios");
  try {
    const headRes = await axios.head(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      timeout: 5000
    }).catch(() => null);

    let isPdf = url.toLowerCase().includes(".pdf");
    let contentLength = 0;

    if (headRes && headRes.headers) {
      if (headRes.headers["content-type"] && headRes.headers["content-type"].includes("application/pdf")) {
        isPdf = true;
      }
      contentLength = parseInt(headRes.headers["content-length"] || "0", 10);
    }

    if (isPdf) {
      if (contentLength > 5 * 1024 * 1024) {
        return "[Hệ thống: Link này chứa File PDF quá lớn (>5MB), không hỗ trợ phân tích để bảo vệ hệ thống]";
      }
      console.log(`[Scraper] Bắt đầu tải file PDF từ URL: ${url}`);
      const { data: pdfBuffer } = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
        responseType: "arraybuffer",
        timeout: 15000
      });
      if (pdfBuffer.length > 5 * 1024 * 1024) {
        return "[Hệ thống: File PDF tải về quá lớn (>5MB), không hỗ trợ phân tích]";
      }
      
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const localPath = path.join(os.tmpdir(), `url_${Date.now()}.pdf`);
      fs.writeFileSync(localPath, pdfBuffer);
      
      const llm = require("./gemini");
      const fileDesc = await llm.analyzeDocument(localPath, true);
      return `[TÀI LIỆU PDF TRỪ URL]:\n"${fileDesc.trim()}"`;
    }

    const { data: html } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      timeout: 8000
    });
    if (typeof html !== "string") return null;

    const bodyMatch = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    const text = (bodyMatch ? bodyMatch[1] : html)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    return text || null;
  } catch (error) {
    console.error("[Scraper] Lỗi đọc URL:", url, error.message);
    return null;
  }
};

/**
 * Xây dựng ngữ cảnh web cho câu hỏi của người dùng.
 * Ưu tiên scrape URL nếu có, ngược lại dùng Tavily search nếu cần.
 * @param {string} prompt - Câu chat gốc của người dùng (có thể chứa URL, @mention)
 * @param {boolean} isPreOptimized - Đã tối ưu search query chưa
 * @param {string|null} sessionId - ID phiên trò chuyện để đọc/ghi cache
 * @returns {Promise<Object>} Chuỗi ngữ cảnh web và danh sách urls nguồn
 */
const resolveWebContext = async (prompt, isPreOptimized = false, sessionId = null) => {
  const urls = prompt.match(URL_REGEX);
  let urlText = null;

  if (urls && urls.length > 0) {
    const targetUrl = urls[0];
    console.log(`[Scraper] Đọc nội dung từ: ${targetUrl}`);
    urlText = await scrapeUrl(targetUrl);
  }

  // Tải cache webContext ngắn hạn (5 phút) trên RTDB để tối ưu chi phí
  const { rtdb } = require("./db");
  const now = Date.now();
  let cachedContext = "";
  let cachedUrls = [];

  const cleanPrompt = prompt
    .replace(/\[đang trả lời tin nhắn của[^\]]*\]\s*/gi, "")
    .replace(/^"[^"]{0,600}"\s*/g, "")
    .replace(/@[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const isFollowUp = 
    isPreOptimized ||
    cleanPrompt.split(" ").length <= 5 ||
    /nguồn.*là gì|nguồn.*gì|nguồn đâu|link đâu|ở đâu ra|chi tiết hơn|tại sao|giải thích thêm|giải thích rõ|nêu rõ|nguồn [0-9]/i.test(cleanPrompt);

  if (sessionId && isFollowUp) {
    try {
      const cacheSnap = await rtdb.ref(`chats/${sessionId}/metadata/last_web_context`).once("value");
      if (cacheSnap.exists()) {
        const cacheData = cacheSnap.val();
        if (cacheData && cacheData.createdAt && (now - cacheData.createdAt < 5 * 60 * 1000)) {
          // So khớp từ khóa động (Dynamic Keyword Matching) để phát hiện lệch chủ đề
          const normalizedPrompt = removeAccents(cleanPrompt.toLowerCase());
          const queryKeywords = normalizedPrompt.split(/[\s,.\-?!\/]+/)
            .filter(w => w.length >= 3 && !stopWordsList.includes(w));
          
          const cacheLowerContext = removeAccents((cacheData.context || "").toLowerCase());
          const isTopicMismatch = queryKeywords.some(kw => !cacheLowerContext.includes(kw));

          if (!isTopicMismatch) {
            console.log(`[Search Router] TÁI SỬ DỤNG CACHE webContext cho câu hỏi nối tiếp: "${cleanPrompt}"`);
            cachedContext = cacheData.context || "";
            cachedUrls = cacheData.urls || [];
            
            if (!urlText && !cachedContext) return { context: "", urls: [] };
            let context = "";
            if (urlText) context += `\n\n[NỘI DUNG URL NGƯỜI DÙNG GỬI ĐẾN]:\n${urlText}\n`;
            if (cachedContext) context += cachedContext;
            
            return { context, urls: cachedUrls };
          } else {
            console.log(`[Search Router] Phát hiện lệch chủ đề (từ khóa lệch: ${queryKeywords.filter(kw => !cacheLowerContext.includes(kw)).join(", ")}). Bỏ qua cache.`);
          }
        }
      }
    } catch (e) {
      console.error("[Search Router] Lỗi đọc cache webContext:", e.message);
    }
  }

  let searchSummary = "";
  let searchUrls = [];
  if (isPreOptimized || checkNeedsSearch(prompt)) {
    let finalQuery = prompt;
    let cleanQuery = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();

    if (!isPreOptimized) {
      const extractionResult = await extractSearchQuery(cleanQuery);
      
      if (!extractionResult.has_entity) {
        console.log(`[Search Router] Bị chặn do thiếu Danh từ riêng (has_entity = false)`);
        return { context: "", urls: [] };
      }
      finalQuery = extractionResult.query;
    }
    
    const { TODAY_KEYWORDS } = require("./tavily");
    const isTodaySensitive = TODAY_KEYWORDS.some(kw => cleanQuery.toLowerCase().includes(kw));
    if (isTodaySensitive) {
      const todayStr = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      finalQuery = `${finalQuery} ngày ${todayStr}`;
    } else {
      if (!/\b20\d{2}\b/.test(finalQuery)) {
        const currentYear = new Date().getFullYear();
        finalQuery = `${finalQuery} năm ${currentYear}`;
      }
    }

    const botConfig = await getBotConfig();
    const CATEGORY_REGEX = {
      NEWS: new RegExp(botConfig.search_keywords.NEWS || "bóng đá|tin tức|thời sự", "i"),
      FINANCE: new RegExp(botConfig.search_keywords.FINANCE || "giá vàng|tỷ giá|chứng khoán", "i"),
      DEV: new RegExp(botConfig.search_keywords.DEV || "code|lập trình|api", "i"),
      SOCIAL: new RegExp(botConfig.search_keywords.SOCIAL || "drama|phốt|twitter|x\\b", "i")
    };

    let category = "GENERAL";
    if (CATEGORY_REGEX.DEV.test(finalQuery)) category = "DEV";
    else if (CATEGORY_REGEX.SOCIAL.test(finalQuery)) category = "SOCIAL";
    else if (CATEGORY_REGEX.NEWS.test(finalQuery) || CATEGORY_REGEX.FINANCE.test(finalQuery)) category = "NEWS";

    console.log(`[Search Router] Kích hoạt tìm kiếm: "${finalQuery}" | Category: ${category}`);
    
    try {
      if (category === "DEV" || category === "SOCIAL") {
        // Exa không còn hỗ trợ danh mục "tweet" và "github", thực hiện tìm kiếm chung không kèm category
        const res = await searchExa(finalQuery);
        if (res) { searchSummary = res.summary; searchUrls = res.urls; }
      } else {
        const tavilyTopic = category === "NEWS" ? "news" : "general";
        const res = await searchTavily(finalQuery, { topic: tavilyTopic });
        if (res) { searchSummary = res.summary; searchUrls = res.urls; }
      }
    } catch (err) {
      console.log(`[Search Router] Nguồn chính lỗi, chạy fallback: ${err.message}`);
      try {
        if (category === "DEV" || category === "SOCIAL") {
          const res = await searchTavily(finalQuery);
          if (res) { searchSummary = res.summary; searchUrls = res.urls; }
        } else {
          const res = await searchExa(finalQuery);
          if (res) { searchSummary = res.summary; searchUrls = res.urls; }
        }
      } catch (fallbackErr) {
        console.error(`[Search Router] Cả Tavily và Exa đều lỗi.`);
      }
    }
    
    searchSummary = searchSummary.trim();
  }

  // Không inject gì nếu không có dữ liệu — tránh lãng phí token
  if (!urlText && !searchSummary) return { context: "", urls: [] };

  let context = "";
  if (urlText) context += `\n\n[NỘI DUNG URL NGƯỜI DÙNG GỬI ĐẾN]:\n${urlText}\n`;
  
  let internetContext = "";
  if (searchSummary) {
    const todayStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    internetContext = `\n\n[THÔNG TIN TỪ INTERNET (Thời gian thực: ${todayStr})]:\n${searchSummary}\n`;
    context += internetContext;
  }

  // Lưu cache mới vào RTDB
  if (sessionId && searchSummary) {
    rtdb.ref(`chats/${sessionId}/metadata/last_web_context`).set({
      context: internetContext,
      urls: searchUrls || [],
      createdAt: now
    }).catch(e => console.error("[Search Router] Lỗi ghi cache webContext:", e.message));
  }

  return { context, urls: searchUrls || [] };
};

module.exports = { checkNeedsSearch, scrapeUrl, resolveWebContext };
