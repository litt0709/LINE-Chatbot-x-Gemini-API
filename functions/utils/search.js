const axios = require("axios");

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

/**
 * Tìm kiếm thông tin trên internet bằng Tavily API.
 * @param {string} query - Nội dung cần tìm kiếm
 * @returns {Promise<string|null>} Chuỗi thông tin tóm tắt kết quả tìm kiếm
 */
const searchWeb = async (query) => {
  if (!TAVILY_API_KEY || TAVILY_API_KEY === "YOUR_TAVILY_API_KEY_HERE") {
    console.log("[Tavily Search] API Key chưa được cấu hình. Bỏ qua tìm kiếm.");
    return null;
  }

  try {
    const response = await axios.post("https://api.tavily.com/search", {
      api_key: TAVILY_API_KEY,
      query: query,
      search_depth: "basic",
      max_results: 3
    });

    const results = response.data.results || [];
    if (results.length === 0) return "Không tìm thấy kết quả liên quan trên internet.";

    let summary = "Thông tin thực tế tìm kiếm được từ Internet:\n";
    results.forEach((res, index) => {
      summary += `[Kết quả ${index + 1}] Tiêu đề: ${res.title}\nNguồn: ${res.url}\nNội dung tóm tắt: ${res.content}\n\n`;
    });

    return summary;
  } catch (error) {
    console.error("[Tavily Search] Lỗi tìm kiếm:", error?.response?.data || error.message);
    return null;
  }
};

/**
 * Tải và trích xuất nội dung văn bản từ một đường dẫn URL.
 * @param {string} url - Đường dẫn trang web cần đọc
 * @returns {Promise<string|null>} Nội dung văn bản thô trích xuất từ trang web
 */
const scrapeUrl = async (url) => {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
      timeout: 8000
    });
    let html = response.data;
    if (typeof html !== "string") return null;

    // Loại bỏ các thẻ script và style
    html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");

    // Lấy nội dung phần body
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let content = bodyMatch ? bodyMatch[1] : html;

    // Loại bỏ tất cả thẻ HTML
    content = content.replace(/<[^>]*>/g, " ");

    // Loại bỏ khoảng trắng và xuống dòng thừa
    content = content.replace(/\s+/g, " ").trim();

    // Giới hạn độ dài nội dung gửi lên AI (khoảng 4000 ký tự đầu tiên để tránh tràn token)
    return content.slice(0, 4000);
  } catch (error) {
    console.error("[Scraper] Lỗi đọc URL:", url, error.message);
    return null;
  }
};

module.exports = { searchWeb, scrapeUrl };
