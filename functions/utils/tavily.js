const axios = require("axios");

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Từ khóa nhận diện câu hỏi cần kết quả trong ngày hôm nay
const TODAY_KEYWORDS = [
  "hôm nay", "hum nay", "nay", "mới nhất", "latest", "recent", "tin hot",
  "tin tức", "thời tiết", "giá vàng", "kqxs", "tỷ giá", "cập nhật", "news",
  "tối nay", "đêm nay", "sáng nay", "chiều nay",
  "ngày mai", "tối mai", "đêm mai", "sáng mai", "chiều mai"
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

  const trustedDomains = require("./trusted_sources.json");

  const params = {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: "advanced",
    include_answer: true,
    max_results: 5,
    include_domains: trustedDomains,
    ...(isTodaySensitive && { time_range: "day" })
  };

  try {
    console.log(`[Tavily] Query: "${query}" | Hôm nay: ${isTodaySensitive} | Ưu tiên trang chính thống VN`);
    let response = await axios.post("https://api.tavily.com/search", params);

    // Retry fallback nếu nguồn chính thống không có dữ liệu
    if (!response.data.answer && (!response.data.results || response.data.results.length === 0)) {
      console.log(`[Tavily] Trang chính thống không có kết quả, tự động mở rộng tìm kiếm toàn mạng Internet...`);
      delete params.include_domains;
      response = await axios.post("https://api.tavily.com/search", params);
    }

    const { answer, results = [] } = response.data;
    if (!answer && results.length === 0) return "Không tìm thấy kết quả liên quan trên internet.";

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
    console.error("[Tavily] Lỗi tìm kiếm:", error?.response?.data || error.message);
    return null;
  }
};

module.exports = { searchTavily, TODAY_KEYWORDS };
