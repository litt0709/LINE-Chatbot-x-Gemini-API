const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appLine = admin.initializeApp({
  credential: admin.credential.cert(lineKey),
  databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "LINE_CLEAN");

const appTele = admin.initializeApp({
  credential: admin.credential.cert(teleKey),
  databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "TELE_CLEAN");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanRegexPipeString(str) {
  if (!str) return "xin link|cho link|gửi link|địa chỉ|url|link|cho xin|ở đâu|trang nào";
  const parts = str.split("|").map(p => p.trim()).filter(Boolean);
  const cleanedParts = parts.map(p => {
    // Nếu có chứa cú pháp regex không an toàn như unescaped parentheses hay emoji unescaped
    try {
      new RegExp(p);
      return p;
    } catch (e) {
      return escapeRegex(p);
    }
  });
  return cleanedParts.join("|");
}

async function fixApp(name, app) {
  console.log(`=== Fixing ${name} system_configs/bot_config ===`);
  const db = app.firestore();
  const docRef = db.collection("system_configs").doc("bot_config");
  const snap = await docRef.get();
  if (!snap.exists) {
    console.log(`No bot_config found for ${name}`);
    return;
  }
  const data = snap.data();
  console.log(`Current link_requests_regex:`, data.link_requests_regex);
  
  // Loại bỏ các đoạn vô nghĩa hoặc escape
  let cleaned = data.link_requests_regex || "";
  // Xóa đoạn ;))) lỗi
  cleaned = cleaned.replace(/\|?\s*đâu e xin 1 cái demo\s*;?\)+/gi, "");
  cleaned = cleanRegexPipeString(cleaned);
  
  console.log(`New link_requests_regex:`, cleaned);
  
  // Kiểm tra tính hợp lệ của regex mới
  try {
    new RegExp(cleaned, "i");
    console.log(`Regex verified valid!`);
  } catch (err) {
    console.error(`Invalid regex generated:`, err.message);
    cleaned = "xin link|cho link|gửi link|địa chỉ|url|link|cho xin|ở đâu|trang nào";
  }

  // Kiểm tra và làm sạch search_keywords nếu có
  let cleanedSearchKeywords = data.search_keywords || {};
  for (const [k, v] of Object.entries(cleanedSearchKeywords)) {
    if (typeof v === "string") {
      cleanedSearchKeywords[k] = cleanRegexPipeString(v);
    }
  }

  // Kiểm tra standalone_topics
  let cleanedTopics = (data.standalone_topics || []).map(t => {
    try {
      new RegExp(t, "i");
      return t;
    } catch (e) {
      return escapeRegex(t);
    }
  });

  await docRef.set({
    link_requests_regex: cleaned,
    search_keywords: cleanedSearchKeywords,
    standalone_topics: cleanedTopics,
    updated_at: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log(`✅ Updated ${name} bot_config successfully.`);
}

async function run() {
  await fixApp("LINE", appLine);
  await fixApp("TELEGRAM", appTele);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
