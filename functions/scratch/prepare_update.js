const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

function mergeRegexString(existingStr, newItems) {
  const currentList = (existingStr || "").split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
  const set = new Set(currentList);
  
  for (const item of newItems) {
    const clean = item.trim().toLowerCase();
    if (clean && !set.has(clean)) {
      set.add(clean);
    }
  }
  return Array.from(set).join("|");
}

function mergeArray(existingArr, newItems) {
  const currentList = Array.isArray(existingArr) ? existingArr : [];
  const set = new Set(currentList.map(s => (typeof s === "string" ? s.trim().toLowerCase() : s)));
  const result = [...currentList];

  for (const item of newItems) {
    const clean = typeof item === "string" ? item.trim() : item;
    const cleanKey = typeof item === "string" ? item.trim().toLowerCase() : item;
    if (clean && !set.has(cleanKey)) {
      set.add(cleanKey);
      result.push(clean);
    }
  }
  return result;
}

async function prepareUpdate() {
  const db = appLine.firestore();
  const snap = await db.collection("audit_logs").get();

  const auditKeywordsByCategory = {
    DEV: [],
    FINANCE: [],
    NEWS: [],
    SOCIAL: [],
    GENERAL: []
  };

  const missedLinks = [];
  const missedTopics = [];
  const missedProactive = [];
  const docIdsToClean = [];

  snap.forEach(doc => {
    docIdsToClean.push(doc.id);
    const data = doc.data();

    // 1. audit_keywords
    if (data.audit_keywords && Array.isArray(data.audit_keywords)) {
      data.audit_keywords.forEach(kw => {
        let cat = (kw.suggested_category || "GENERAL").toUpperCase();
        if (cat === "BUSINESS") cat = "FINANCE";
        if (!auditKeywordsByCategory[cat]) {
          auditKeywordsByCategory[cat] = [];
        }
        auditKeywordsByCategory[cat].push(kw.word);
      });
    }

    // 2. missed_link_requests
    if (data.missed_link_requests && Array.isArray(data.missed_link_requests)) {
      data.missed_link_requests.forEach(lr => {
        // extract core request phrase if it's a long sentence, or keep key phrase
        missedLinks.push(lr);
      });
    }

    // 3. missed_topics
    if (data.missed_topics && Array.isArray(data.missed_topics)) {
      missedTopics.push(...data.missed_topics);
    }

    // 4. missed_proactive_keywords
    if (data.missed_proactive_keywords && Array.isArray(data.missed_proactive_keywords)) {
      missedProactive.push(...data.missed_proactive_keywords);
    }
  });

  // Additional refined phrases from missed_link_requests
  // "cậu bảo bên Ấn đang cách làm mới thì tớ tham khảo á" -> "tham khảo", "cho tham khảo"
  const refinedLinks = ["tham khảo", "cho tham khảo", "để tham khảo", ...missedLinks];

  // Refined proactive keywords
  const refinedProactive = [
    "chưa rõ lắm",
    "k rõ output",
    "tính tiền thế nào",
    "đo lường kiểu gì",
    "khoai thế",
    "chưa bật ý lắm",
    "méo hứng khởi",
    "oặt ẹo lờ vờ",
    "dân mất dần niềm tin",
    "không hiểu",
    "giúp với"
  ];

  console.log("Categories Keywords:", JSON.stringify(auditKeywordsByCategory, null, 2));
  console.log("Refined Links:", refinedLinks);
  console.log("Missed Topics:", missedTopics);
  console.log("Refined Proactive:", refinedProactive);
  console.log("Docs to clean:", docIdsToClean);

  return {
    auditKeywordsByCategory,
    refinedLinks,
    missedTopics,
    refinedProactive,
    docIdsToClean
  };
}

prepareUpdate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
