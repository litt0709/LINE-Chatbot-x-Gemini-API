const { searchTavily, TODAY_KEYWORDS } = require("./tavily");
const { searchExa } = require("./exa");
const axios = require("axios");

/**
 * Trích xuất từ khóa tìm kiếm (Dùng Regex nội bộ thay vì LLM để giảm độ trễ).
 * @param {string} contextualPrompt - Câu nói đã được bù đắp ngữ cảnh
 * @returns {Promise<{query: string, has_entity: boolean}>}
 */
const extractSearchQuery = async (contextualPrompt) => {
  // 1. Mở rộng bộ từ rác (noise words)
  const noiseWords = [
    "annie ơi", "annie", "bot ơi", "bot", "cho anh hỏi", "cho em hỏi", "cho mình hỏi", "hỏi xíu",
    "tìm giúp", "tìm giùm", "tra giúp", "tra giùm", "xem giúp", "xem giùm", "giúp anh", "giúp em",
    "cho anh", "cho em", "cho chị", "cho mình", "với", "nhé", "nha", "đi", "ạ", "ơi",
    "chưa em", "chưa anh", "nhỉ", "có trận nào", "có ai", "có...không", "có...chưa",
    "thế nào", "ra sao", "chi tiết hơn", "thông tin", "kể về", "biết gì", "nào"
  ];
  
  let query = contextualPrompt;
  for (const word of noiseWords) {
    query = query.replace(new RegExp(`\\b${word}\\b`, 'gi'), "");
  }
  
  // 2. Chuyển dấu câu thành khoảng trắng để không dính chữ, KHÔNG dùng Set khử trùng lặp
  query = query.replace(/[.,?!]/g, " ").replace(/\s+/g, ' ').trim();

  // Fallback nếu xóa xong rỗng
  if (!query) query = contextualPrompt.replace(/[.,?!]/g, " ");

  // Nhận diện có cần search không (thay thế cho LLM has_entity)
  // Check viết hoa (Bỏ qua ký tự đầu tiên của câu)
  const hasCapitalized = /[A-ZĐ]/.test(query.substring(1));
  
  // Check các từ khóa đặc biệt
  const specialKeywords = ["lịch", "tỷ số", "tỉ số", "kết quả", "kqxs", "giá", "thời tiết", "bóng đá", "tứ kết", "bán kết", "chung kết", "trận", "tin tức", "điểm thi", "bầu cử", "chứng khoán", "vàng sjc"];
  const hasSpecial = specialKeywords.some(kw => query.toLowerCase().includes(kw));

  const has_entity = hasCapitalized || hasSpecial;

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
  const axios = require("axios");
  try {
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
 * @returns {Promise<string>} Chuỗi ngữ cảnh web (rỗng nếu không cần search)
 */
const resolveWebContext = async (prompt, isPreOptimized = false) => {
  const urls = prompt.match(URL_REGEX);
  let urlText = null;

  if (urls && urls.length > 0) {
    const targetUrl = urls[0];
    console.log(`[Scraper] Đọc nội dung từ: ${targetUrl}`);
    urlText = await scrapeUrl(targetUrl);
  }

  let searchSummary = "";
  if (isPreOptimized || checkNeedsSearch(prompt)) {
    let finalQuery = prompt;
    let cleanQuery = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();

    if (!isPreOptimized) {
      // LLM Query Extraction (Phương án 2): Trích xuất chính xác từ khóa, bỏ qua mọi rác hội thoại
      const extractionResult = await extractSearchQuery(cleanQuery);
      
      if (!extractionResult.has_entity) {
        console.log(`[Search Router] Bị chặn do thiếu Danh từ riêng (has_entity = false)`);
        return "";
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

    const CATEGORY_REGEX = {
      NEWS: /bóng đá|tứ kết|trận|kết quả|tỉ số|tỷ số|tin tức|thời sự|chính trị/i,
      FINANCE: /giá vàng|tỷ giá|chứng khoán|cổ phiếu|vnindex/i,
      DEV: /code|lập trình|lỗi|api|react|nodejs|github/i,
      SOCIAL: /drama|phốt|cộng đồng mạng|twitter|x\b/i
    };

    let category = "GENERAL";
    if (CATEGORY_REGEX.DEV.test(finalQuery)) category = "DEV";
    else if (CATEGORY_REGEX.SOCIAL.test(finalQuery)) category = "SOCIAL";
    else if (CATEGORY_REGEX.NEWS.test(finalQuery) || CATEGORY_REGEX.FINANCE.test(finalQuery)) category = "NEWS";

    console.log(`[Search Router] Kích hoạt tìm kiếm: "${finalQuery}" | Category: ${category}`);
    
    try {
      if (category === "DEV" || category === "SOCIAL") {
        const exaCat = category === "DEV" ? "github" : "tweet";
        searchSummary = await searchExa(finalQuery, { category: exaCat }) || "";
      } else {
        const tavilyTopic = category === "NEWS" ? "news" : "general";
        searchSummary = await searchTavily(finalQuery, { topic: tavilyTopic }) || "";
      }
    } catch (err) {
      console.log(`[Search Router] Nguồn chính lỗi, chạy fallback: ${err.message}`);
      try {
        if (category === "DEV" || category === "SOCIAL") {
          searchSummary = await searchTavily(finalQuery) || "";
        } else {
          searchSummary = await searchExa(finalQuery) || "";
        }
      } catch (fallbackErr) {
        console.error(`[Search Router] Cả Tavily và Exa đều lỗi.`);
      }
    }
    
    searchSummary = searchSummary.trim();
  }


  // Không inject gì nếu không có dữ liệu — tránh lãng phí token
  if (!urlText && !searchSummary) return "";

  let context = "";
  if (urlText) context += `\n\n[NỘI DUNG URL NGƯỜI DÙNG GỬi ĐẾN]:\n${urlText}\n`;
  if (searchSummary) context += `\n\n[THÔNG TIN TỪ INTERNET]:\n${searchSummary}\n`;
  
  return context;
};

module.exports = { checkNeedsSearch, scrapeUrl, resolveWebContext };
