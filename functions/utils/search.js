const { searchTavily, TODAY_KEYWORDS } = require("./tavily");
const { searchExa } = require("./exa");

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
  "tin hot", "fact check", "kiểm chứng", "sự thật", "tin chuẩn", "tin thật"
];

const QUESTION_PATTERNS = [
  /ai là/i, /cái gì/i, /ở đâu/i, /khi nào/i,
  /thế nào/i, /như thế nào/i, /làm sao để/i, /hướng dẫn cách/i,
  /thì sao/i, /còn.+không/i
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
    const cleanQuery = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();
    
    let finalQuery = cleanQuery;
    const { TODAY_KEYWORDS } = require("./tavily");
    const isTodaySensitive = TODAY_KEYWORDS.some(kw => cleanQuery.toLowerCase().includes(kw));
    if (isTodaySensitive) {
      const todayStr = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      finalQuery = `${cleanQuery} ngày ${todayStr}`;
    }

    console.log(`[Search Router] Kích hoạt tìm kiếm song song: "${finalQuery}"`);
    
    const [tavilyRes, exaRes] = await Promise.allSettled([
      searchTavily(finalQuery),
      searchExa(finalQuery)
    ]);

    if (tavilyRes.status === "fulfilled" && tavilyRes.value) {
      searchSummary += tavilyRes.value + "\n";
    }
    if (exaRes.status === "fulfilled" && exaRes.value) {
      searchSummary += exaRes.value + "\n";
    }
    
    searchSummary = searchSummary.trim();
  }

  let context = "";
  if (urlText) context += `\n\n[NỘI DUNG URL NGƯỜI DÙNG GỬI ĐẾN]:\n${urlText}\n`;
  
  if (searchSummary) {
    context += `\n\n[THÔNG TIN TỪ INTERNET]:\n${searchSummary}\n`;
  } else {
    context += `\n\n[THÔNG TIN TỪ INTERNET]:\nKhông có dữ liệu tìm kiếm cho câu hỏi này.\n`;
  }
  
  return context;
};

module.exports = { checkNeedsSearch, scrapeUrl, resolveWebContext };
