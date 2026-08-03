const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

const serviceAccountPath = path.join(__dirname, "../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
}

const db = admin.firestore();

// --- Trích xuất dữ liệu cứng từ file ---

// 1. Lấy CATEGORY_REGEX từ search.js
const searchCode = fs.readFileSync(path.join(__dirname, "../functions/utils/search.js"), "utf8");
const newsMatch = searchCode.match(/NEWS: \/(.+?)\/i,/);
const financeMatch = searchCode.match(/FINANCE: \/(.+?)\/i,/);
const devMatch = searchCode.match(/DEV: \/(.+?)\/i,/);
const socialMatch = searchCode.match(/SOCIAL: \/(.+?)\/i/);

// 2. Lấy STANDALONE_TOPICS và Link Requests từ deepseek.js
const deepseekCode = fs.readFileSync(path.join(__dirname, "../functions/utils/deepseek.js"), "utf8");
const topicsMatch = deepseekCode.match(/const STANDALONE_TOPICS = \[([\s\S]+?)\];/);
let standaloneTopics = [];
if (topicsMatch) {
    const rawTopics = topicsMatch[1];
    const regexes = rawTopics.match(/\/(.+?)\/i/g);
    if (regexes) {
        standaloneTopics = regexes.map(r => r.replace(/^\/|\/i$/g, ''));
    }
}
const linkMatch = deepseekCode.match(/(\/xin link\|cho link\|gửi link\|địa chỉ\|url\|link\|cho xin\|ở đâu\|trang nào\|[^/]*)\/i/);

// 3. Lấy PROACTIVE_TRIGGER_WORDS từ index.js
const indexCode = fs.readFileSync(path.join(__dirname, "../functions/index.js"), "utf8");
const proactiveMatch = indexCode.match(/const PROACTIVE_TRIGGER_WORDS = \[([\s\S]+?)\];/);
let proactiveWords = [];
if (proactiveMatch) {
    proactiveWords = proactiveMatch[1].split(',').map(s => s.trim().replace(/"/g, '')).filter(Boolean);
}

// 4. Lấy leak_blacklist
let leakBlacklist = [];
const leakPath = path.join(__dirname, "../functions/utils/leak_blacklist.json");
if (fs.existsSync(leakPath)) {
    leakBlacklist = JSON.parse(fs.readFileSync(leakPath, "utf8"));
}

async function initConfig() {
  const configRef = db.collection("system_configs").doc("bot_config");
  
  const configData = {
    search_keywords: {
      NEWS: newsMatch ? newsMatch[1] : "",
      FINANCE: financeMatch ? financeMatch[1] : "",
      DEV: devMatch ? devMatch[1] : "",
      SOCIAL: socialMatch ? socialMatch[1] : ""
    },
    standalone_topics: standaloneTopics,
    link_requests_regex: linkMatch ? linkMatch[1].replace(/^\//, '') : "xin link|cho link|gửi link|địa chỉ|url|link|cho xin|ở đâu|trang nào",
    proactive_trigger_words: proactiveWords,
    leak_blacklist: leakBlacklist,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  };

  await configRef.set(configData);
  console.log("Khởi tạo bot_config thành công!");
  process.exit(0);
}

initConfig();
