const axios = require("axios");

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// ─── Regex lọc URL ───────────────────────────────────────────────────────────
const URL_REGEX = /(https?:\/\/[^\s"'>\]]+)/gi;

// ─── Từ khóa nhận diện câu hỏi cần search ───────────────────────────────────
const SEARCH_KEYWORDS = [
  "tìm", "tra cứu", "search", "giá", "thời tiết", "tin tức", "hôm nay", "mới nhất",
  "tỷ giá", "kết quả", "lịch", "bao nhiêu", "ngày", "đêm", "triệu chứng", "thuốc",
  "xổ số", "vàng", "kqxs", "cập nhật", "recent", "news", "latest", "bóng đá", "hôm qua",
  "đá lúc mấy giờ", "chiếu kênh nào", "bản đồ", "địa chỉ", "giá xăng", "đăng ký",
  "mua ở đâu", "tại sao", "như thế nào", "là ai", "là cái gì", "là gì",
  "đội", "trận", "thắng", "thua", "vô địch", "bàn thắng", "ghi bàn", "tỉ số"
];

const QUESTION_PATTERNS = [
  /ai là/i, /cái gì/i, /ở đâu/i, /khi nào/i,
  /thế nào/i, /như thế nào/i, /làm sao để/i, /hướng dẫn cách/i,
  /thì sao/i, /còn.+không/i
];

// ─── Từ khóa nhận diện câu hỏi cần kết quả trong ngày hôm nay ───────────────
const TODAY_KEYWORDS = [
  "hôm nay", "mới nhất", "latest", "recent",
  "tin tức", "thời tiết", "giá vàng", "kqxs", "tỷ giá", "cập nhật", "news"
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
 * Tìm kiếm thông tin trên internet bằng Tavily API.
 * @param {string} query
 * @returns {Promise<string|null>}
 */
const searchWeb = async (query) => {
  if (!TAVILY_API_KEY || TAVILY_API_KEY === "YOUR_TAVILY_API_KEY_HERE") {
    console.log("[Tavily] API Key chưa được cấu hình. Bỏ qua tìm kiếm.");
    return null;
  }

  const isTodaySensitive = TODAY_KEYWORDS.some(kw => query.toLowerCase().includes(kw));

  const params = {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: isTodaySensitive ? "advanced" : "basic",
    include_answer: true,
    max_results: 10,
    ...(isTodaySensitive && { time_range: "week" })
  };

  try {
    console.log(`[Tavily] Query: "${query}" | Hôm nay: ${isTodaySensitive}`);
    const { data } = await axios.post("https://api.tavily.com/search", params);

    const { answer, results = [] } = data;
    if (!answer && results.length === 0) return "Không tìm thấy kết quả liên quan trên internet.";

    let summary = "Thông tin thực tế từ Internet:\n";
    if (answer) summary += `[Tóm tắt]: ${answer}\n\n`;
    if (results.length > 0) {
      summary += "[Nguồn tham khảo]:\n";
      results.forEach((r, i) => {
        summary += `[${i + 1}] ${r.title}\n${r.url}\n${r.content}\n\n`;
      });
    }
    return summary;
  } catch (error) {
    console.error("[Tavily] Lỗi tìm kiếm:", error?.response?.data || error.message);
    return null;
  }
};

/**
 * Tải và trích xuất nội dung văn bản thuần từ một URL.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
const scrapeUrl = async (url) => {
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

  if (urls && urls.length > 0) {
    const targetUrl = urls[0];
    console.log(`[Scraper] Đọc nội dung từ: ${targetUrl}`);
    const text = await scrapeUrl(targetUrl);
    if (text) {
      return `\n\n[NỘI DUNG TRANG WEB (${targetUrl})]:\n${text}\n(Hãy ưu tiên nội dung trên để tóm tắt/trả lời theo yêu cầu người dùng.)`;
    }
    return "";
  }

  if (checkNeedsSearch(prompt)) {
    const cleanQuery = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();
    console.log(`[Tavily] Tìm kiếm: "${cleanQuery}"`);
    const result = await searchWeb(cleanQuery);
    if (result) {
      return `\n\n[THÔNG TIN TỪ INTERNET]\n${result}\n(Dùng thông tin trên để trả lời chính xác câu hỏi của người dùng.)`;
    } else {
      // Safeguard: Ngăn chặn LLM bịa đặt khi API tìm kiếm chết
      return `\n\n[HỆ THỐNG CẢNH BÁO]: Công cụ tìm kiếm Internet hiện đang bị lỗi hoặc mất kết nối. BẠN HIỆN KHÔNG CÓ BẤT KỲ DỮ LIỆU THỰC TẾ NÀO LÚC NÀY. YÊU CẦU BẮT BUỘC: Hãy xin lỗi người dùng vì không thể truy cập Internet và TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ BỊA ĐẶT KẾT QUẢ, ĐIỂM SỐ HOẶC TIN TỨC THỜI SỰ!`;
    }
  }

  return "";
};

module.exports = { checkNeedsSearch, searchWeb, scrapeUrl, resolveWebContext };
