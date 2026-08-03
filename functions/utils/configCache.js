const { db } = require("./db");

// Simple in-memory cache
let cachedConfig = null;
let lastFetched = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Lấy cấu hình bot từ Firestore có cache 5 phút
 */
const getBotConfig = async () => {
  const now = Date.now();
  if (cachedConfig && now - lastFetched < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const docRef = db.collection("system_configs").doc("bot_config");
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      cachedConfig = docSnap.data();
      lastFetched = now;
      console.log("[ConfigCache] Đã tải lại bot_config từ Firestore.");
    } else {
      console.warn("[ConfigCache] Không tìm thấy bot_config trên Firestore.");
    }
  } catch (error) {
    console.error("[ConfigCache] Lỗi khi tải bot_config:", error);
  }

  // Fallback an toàn (phòng trường hợp lỗi DB hoặc mất mạng)
  return cachedConfig || {
    search_keywords: { NEWS: "", FINANCE: "", DEV: "", SOCIAL: "" },
    standalone_topics: [],
    link_requests_regex: "xin link|cho link|gửi link|địa chỉ|url|link|cho xin|ở đâu|trang nào",
    proactive_trigger_words: ["ai biết", "làm sao", "lỗi gì", "bug", "không chạy", "có cách nào", "bác nào", "mọi người", "xin ý kiến", "chịu", "rén", "hơi thọt", "rủi ro", "không hiểu", "giúp với", "chỉ dùm", "bế tắc", "cần hỗ trợ", "🆘🆘"],
    leak_blacklist: []
  };
};

module.exports = {
  getBotConfig
};
