const axios = require("axios");

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Từ khóa nhận diện câu hỏi cần kết quả trong ngày hôm nay
const TODAY_KEYWORDS = [
  "hôm nay", "hum nay", "nay", "mới nhất", "latest", "recent", "tin hot",
  "tin tức", "thời tiết", "giá vàng", "kqxs", "tỷ giá", "cập nhật", "news",
  "tối nay", "đêm nay", "sáng nay", "chiều nay",
  "ngày mai", "tối mai", "đêm mai", "sáng mai", "chiều mai",
  "kết quả", "tỉ số", "tỷ số"
];

/**
 * Tìm kiếm thông tin trên internet bằng Tavily API.
 * @param {string} query
 * @returns {Promise<string|null>}
 */
const searchTavily = async (query) => {
  if (!TAVILY_API_KEY || TAVILY_API_KEY === "YOUR_TAVILY_API_KEY_HERE") {
    console.log("[Tavily] API Key chưa được cấu hình. Bỏ qua tìm kiếm.");
    return null;
  }

  const isTodaySensitive = TODAY_KEYWORDS.some(kw => query.toLowerCase().includes(kw));

  const sources = require("./trusted_sources.json");
  const queryLower = query.toLowerCase();

  // Từ khóa ép buộc dùng nguồn VN (thời gian nhạy cảm, lịch thi đấu, thể thao, giá cả VN)
  const forceVnKeywords = ["lịch", "trận", "tỉ số", "tỷ số", "kết quả", "bóng đá", "thể thao", "thời tiết", "giá vàng", "xổ số", "kqxs", "việt nam", "vn", "điểm thi", "chứng khoán"];
  
  // Từ khóa ép buộc dùng nguồn Quốc tế (khoa học, công nghệ toàn cầu, tin thế giới)
  const forceIntlKeywords = ["thế giới", "quốc tế", "châu âu", "mỹ", "tổng thống", "ai ", "artificial intelligence", "crypto", "bitcoin", "blockchain", "nasa", "khoa học", "nghiên cứu", "global", "world", "uk ", "us "];

  const hasVnKeyword = forceVnKeywords.some(kw => queryLower.includes(kw));
  const hasIntlKeyword = forceIntlKeywords.some(kw => queryLower.includes(kw));

  let targetDomains;
  if (hasVnKeyword) {
    targetDomains = sources.vn;
    console.log(`[Tavily Router] Nhánh 1: CÓ Keyword VN -> Ép nguồn VIỆT NAM (GMT+7)`);
  } else if (hasIntlKeyword) {
    targetDomains = sources.intl;
    console.log(`[Tavily Router] Nhánh 2: CÓ Keyword INTL -> Ép nguồn QUỐC TẾ`);
  } else {
    targetDomains = [...sources.vn, ...sources.intl];
    console.log(`[Tavily Router] Nhánh 3 (Default): KHÔNG rõ ràng -> Gộp CẢ HAI nguồn`);
  }

  // Đã tháo Prompt Injection tự động cho các truy vấn giải đấu (Issue #2)
  let optimizedQuery = query;

  const params = {
    api_key: TAVILY_API_KEY,
    query: optimizedQuery,
    search_depth: "basic",
    include_answer: false,
    max_results: 3,
    include_domains: targetDomains,
    ...(isTodaySensitive && { time_range: "day" })
  };

  try {
    console.log(`[Tavily] Query: "${query}" | Hôm nay: ${isTodaySensitive} | Ưu tiên trang chính thống VN`);
    const response = await axios.post("https://api.tavily.com/search", params);
    const { answer, results = [] } = response.data;
    if (!answer && results.length === 0) return null; // Không có kết quả — bình thường, không fallback

    let summary = "Thông tin thực tế từ Internet (Tavily):\n";
    if (answer) summary += `[Tóm tắt]: ${answer}\n\n`;
    if (results.length > 0) {
      summary += "[Nguồn tham khảo]:\n";
      results.forEach((r, i) => {
        summary += `[${i + 1}] ${r.title}\n${r.url}\n${r.content}\n\n`;
      });
    }
    return summary;
  } catch (error) {
    const status = error?.response?.status;
    // Rate limit (429) hoặc Server down (5xx) hoặc network timeout — re-throw để search.js fallback sang Exa
    if (status === 429 || (status >= 500) || !status) {
      console.error(`[Tavily] Lỗi nghiêm trọng (${status || 'network'}), khởi động Exa dự phòng...`);
      throw error;
    }
    // Lỗi khác (4xx, bad request...) — không fallback, trả null
    console.error("[Tavily] Lỗi tìm kiếm:", error?.response?.data || error.message);
    return null;
  }
};

module.exports = { searchTavily, TODAY_KEYWORDS };
// optimize tavily speed: Fri Jul 10 07:46:48 +07 2026
