const axios = require("axios");
const { db, FieldValue } = require("./db");

const EXA_API_KEY = process.env.EXA_API_KEY;

// Bộ nhớ đệm RAM để tránh việc đọc DB liên tục
let exaCache = { month: "", count: 0, initialized: false };
const EXA_MONTHLY_LIMIT = 950;

/**
 * Tìm kiếm thông tin trên internet bằng Exa API.
 * @param {string} query
 * @param {object} options
 * @returns {Promise<string|null>}
 */
const searchExa = async (query, options = {}) => {
  if (!EXA_API_KEY || EXA_API_KEY === "YOUR_EXA_API_KEY_HERE") {
    console.log("[Exa] API Key chưa được cấu hình. Bỏ qua tìm kiếm.");
    return null;
  }

  const { TODAY_KEYWORDS } = require("./tavily");
  const isTodaySensitive = TODAY_KEYWORDS.some(kw => query.toLowerCase().includes(kw));

  const params = {
    query,
    type: "magic",
    useAutoprompt: true,
    numResults: 5,
    contents: {
      text: { maxCharacters: 1500 }
    },
    ...(options.category && { category: options.category })
  };

  if (isTodaySensitive) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    params.startPublishedDate = yesterday.toISOString();
  }

  // Lấy tháng hiện tại (VD: "2026-07")
  const currentMonth = new Date().toISOString().substring(0, 7);

  // Khởi tạo cache từ Firestore nếu chưa có hoặc sang tháng mới
  if (!exaCache.initialized || exaCache.month !== currentMonth) {
    try {
      const doc = await db.collection("metadata").doc("exa_usage").get();
      const data = doc.data() || {};
      if (data.month === currentMonth) {
        exaCache.count = data.count || 0;
      } else {
        exaCache.count = 0; // Reset đầu tháng
      }
      exaCache.month = currentMonth;
      exaCache.initialized = true;
    } catch (e) {
      console.error("[Exa] Lỗi lấy quota từ Firestore:", e.message);
      // Fallback an toàn: Cho phép chạy tạm thời trên RAM
      exaCache.month = currentMonth;
      exaCache.initialized = true;
    }
  }

  // Kiểm tra giới hạn quota
  if (exaCache.count >= EXA_MONTHLY_LIMIT) {
    console.log(`[Exa] Đã đạt giới hạn tháng (${exaCache.count}/${EXA_MONTHLY_LIMIT}). Tạm dừng API Exa.`);
    return null;
  }

  try {
    console.log(`[Exa] Query: "${query}" (Quota: ${exaCache.count}/${EXA_MONTHLY_LIMIT})`);
    const { data } = await axios.post("https://api.exa.ai/search", params, {
      headers: {
        "x-api-key": EXA_API_KEY,
        "Content-Type": "application/json"
      }
    });

    if (!data.results || data.results.length === 0) return null;

    // Thành công: Cập nhật RAM Cache & Firestore bất đồng bộ
    exaCache.count++;
    db.collection("metadata").doc("exa_usage").set({
      month: currentMonth,
      count: FieldValue.increment(1)
    }, { merge: true }).catch(e => console.error("[Exa] Lỗi cập nhật quota:", e.message));

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
