const axios = require("axios");

const EXA_API_KEY = process.env.EXA_API_KEY;

/**
 * Tìm kiếm thông tin trên internet bằng Exa API.
 * @param {string} query
 * @returns {Promise<string|null>}
 */
const searchExa = async (query) => {
  if (!EXA_API_KEY || EXA_API_KEY === "YOUR_EXA_API_KEY_HERE") {
    console.log("[Exa] API Key chưa được cấu hình. Bỏ qua tìm kiếm.");
    return null;
  }

  const params = {
    query,
    type: "magic",
    useAutoprompt: true,
    numResults: 5,
    contents: {
      text: { maxCharacters: 1500 }
    }
  };

  try {
    console.log(`[Exa] Query: "${query}"`);
    const { data } = await axios.post("https://api.exa.ai/search", params, {
      headers: {
        "x-api-key": EXA_API_KEY,
        "Content-Type": "application/json"
      }
    });

    if (!data.results || data.results.length === 0) return null;

    let summary = "Thông tin thực tế từ Internet (Exa):\n";
    data.results.forEach((r, i) => {
      summary += `[Exa-${i + 1}] ${r.title}\n${r.url}\n${r.text}\n\n`;
    });
    
    return summary;
  } catch (error) {
    console.error("[Exa] Lỗi tìm kiếm:", error?.response?.data || error.message);
    return null;
  }
};

module.exports = { searchExa };
