const { searchTavily, TODAY_KEYWORDS } = require("./tavily");
const { searchExa } = require("./exa");
const axios = require("axios");

/**
 * Sử dụng DeepSeek để trích xuất từ khóa tìm kiếm cốt lõi từ câu nói của người dùng.
 * @param {string} contextualPrompt - Câu nói đã được bù đắp ngữ cảnh
 * @returns {Promise<string>}
 */
const extractSearchQuery = async (contextualPrompt) => {
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return contextualPrompt;
    
    const { data } = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: "Bạn là hệ thống trích xuất từ khóa tìm kiếm. BẮT BUỘC trả về JSON: {\"search_query\": \"từ khóa tối ưu nhất\", \"has_entity\": true/false}. has_entity = true NẾU CÓ chứa danh từ riêng (tên giải, đội, người, địa danh...), = false nếu chỉ toàn từ chung chung như 'lịch thi đấu', 'kết quả', 'hôm nay'." },
          { role: "user", content: contextualPrompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 50,
        temperature: 0
      },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` } }
    );
    
    const result = JSON.parse(data.choices[0].message.content);
    let query = result.search_query.trim();
    // Xóa ngoặc kép hoặc dấu chấm do LLM sinh thừa
    query = query.replace(/^["']|["']$/g, "").trim();
    
    console.log(`[LLM Extractor] Original: "${contextualPrompt}" -> Extracted: "${query}", has_entity: ${result.has_entity}`);
    return { query, has_entity: result.has_entity };
  } catch (err) {
    console.error("[LLM Extractor] Lỗi:", err.message);
    return { query: contextualPrompt, has_entity: true }; // Fallback về prompt gốc, coi như có entity để search chạy tiếp
  }
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
  "thông tin", "tổng hợp", "chi tiết", "tiểu sử", "tác giả", "scandal", "drama", "phốt", "hướng dẫn"
];

// ─── Mẫu câu hỏi về giờ/ngày hiện tại — KHAI KHÔNG search (bot tự biết từ system prompt) ───
const SKIP_SEARCH_PATTERNS = [
  /bây giờ (là )?(mấy giờ|ngày mấy)/i,
  /mấy giờ rồi/i, /giờ mấy rồi/i,
  /hôm nay là ngày mấy/i, /ngày mấy rồi/i,
  /bây giờ là bao nhiêu giờ/i
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
const resolveWebContext = async (prompt) => {
  const urls = prompt.match(URL_REGEX);
  let urlText = null;

  if (urls && urls.length > 0) {
    const targetUrl = urls[0];
    console.log(`[Scraper] Đọc nội dung từ: ${targetUrl}`);
    urlText = await scrapeUrl(targetUrl);
  }

  let searchSummary = "";
  if (checkNeedsSearch(prompt)) {
    // LLM Query Extraction (Phương án 2): Trích xuất chính xác từ khóa, bỏ qua mọi rác hội thoại
    let cleanQuery = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();
    const extractionResult = await extractSearchQuery(cleanQuery);
    
    if (!extractionResult.has_entity) {
      console.log(`[Search Router] Bị chặn do thiếu Danh từ riêng (has_entity = false)`);
      return "";
    }
    
    let finalQuery = extractionResult.query;
    const { TODAY_KEYWORDS } = require("./tavily");
    const isTodaySensitive = TODAY_KEYWORDS.some(kw => cleanQuery.toLowerCase().includes(kw));
    if (isTodaySensitive) {
      const todayStr = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      finalQuery = `${extractionResult.query} ngày ${todayStr}`;
    } else {
      if (!/\b20\d{2}\b/.test(finalQuery)) {
        const currentYear = new Date().getFullYear();
        finalQuery = `${extractionResult.query} năm ${currentYear}`;
      }
    }

    console.log(`[Search Router] Kích hoạt tìm kiếm: "${finalQuery}"`);
    
    try {
      const tavilyResult = await searchTavily(finalQuery);
      searchSummary = tavilyResult || "";
    } catch (tavilyErr) {
      // Chỉ fallback Exa khi Tavily chết hẳn (exception), không phải khi no results
      console.log(`[Search Router] Tavily lỗi, fallback sang Exa: ${tavilyErr.message}`);
      try {
        const exaResult = await searchExa(finalQuery);
        searchSummary = exaResult || "";
      } catch (exaErr) {
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
