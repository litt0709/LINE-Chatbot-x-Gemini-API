const axios = require("axios");

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

// Từ khóa nhận diện câu hỏi cần kết quả trong ngày hôm nay
const TODAY_KEYWORDS = [
  "hôm nay", "hum nay", "nay", "mới nhất", "latest", "recent", "tin hot",
  "tin tức", "thời tiết", "giá vàng", "kqxs", "tỷ giá", "cập nhật", "news"
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

  const params = {
    api_key: TAVILY_API_KEY,
    query,
    search_depth: isTodaySensitive ? "advanced" : "basic",
    include_answer: true,
    max_results: 5,
    ...(isTodaySensitive && { time_range: "week" })
  };

  try {
    console.log(`[Tavily] Query: "${query}" | Hôm nay: ${isTodaySensitive}`);
    const { data } = await axios.post("https://api.tavily.com/search", params);

    const { answer, results = [] } = data;
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
