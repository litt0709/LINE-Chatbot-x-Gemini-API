const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP_UPDATE");
const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP_UPDATE");

const lineDb = appLine.firestore();
const teleDb = appTele.firestore();
const { FieldValue } = admin.firestore;

const LINK_GARBAGE = new Set([
  "xin link", "cho link", "gửi link", "địa chỉ", "url", "link", "cho xin", "ở đâu", "trang nào"
]);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeRegexItem(str) {
  const trimmed = str.trim();
  try {
    new RegExp(trimmed, "i");
    return trimmed;
  } catch (e) {
    return escapeRegex(trimmed);
  }
}

function mergeCategoryString(existingStr, newWords) {
  const currentItems = (existingStr || "")
    .split("|")
    .map(s => s.trim().toLowerCase())
    .filter(s => s && !LINK_GARBAGE.has(s));

  const set = new Set(currentItems);

  for (const word of newWords) {
    const clean = word.trim().toLowerCase();
    if (clean && !LINK_GARBAGE.has(clean) && !set.has(clean)) {
      set.add(clean);
      currentItems.push(safeRegexItem(clean));
    }
  }

  const result = currentItems.join("|");
  // Kiểm tra tính hợp lệ
  try {
    new RegExp(result, "i");
    return result;
  } catch (err) {
    console.error("[Regex Error] Chuỗi regex lỗi, escape lại toàn bộ:", err.message);
    return currentItems.map(escapeRegex).join("|");
  }
}

function mergeArray(existingArr, newItems) {
  const currentList = Array.isArray(existingArr) ? [...existingArr] : [];
  const set = new Set(currentList.map(s => (typeof s === "string" ? s.trim().toLowerCase() : s)));

  for (const item of newItems) {
    if (!item) continue;
    const clean = typeof item === "string" ? item.trim() : item;
    const cleanKey = typeof item === "string" ? item.trim().toLowerCase() : item;
    if (clean && !set.has(cleanKey)) {
      set.add(cleanKey);
      currentList.push(clean);
    }
  }
  return currentList;
}

async function runUpdateAndClean() {
  console.log("=== BẮT ĐẦU QUÁ TRÌNH /update ===");

  // 1. Quét toàn bộ audit_logs trên LINE
  const auditSnap = await lineDb.collection("audit_logs").get();
  console.log(`Tìm thấy ${auditSnap.size} documents trong LINE audit_logs.`);

  const catKeywords = { DEV: new Set(), FINANCE: new Set(), SOCIAL: new Set(), NEWS: new Set(), GENERAL: new Set() };
  const linkRequests = new Set();
  const topics = new Set();
  const entities = new Set();
  const proactiveKeywords = new Set();
  const promptLeakageQuestions = [];
  const processedDocIds = [];

  auditSnap.forEach(doc => {
    const data = doc.data();
    let hasAuditData = false;

    if (data.audit_keywords && Array.isArray(data.audit_keywords)) {
      data.audit_keywords.forEach(item => {
        if (!item || !item.word) return;
        const w = item.word.trim();
        const cat = (item.suggested_category || "GENERAL").toUpperCase();
        if (catKeywords[cat]) {
          catKeywords[cat].add(w);
        } else {
          catKeywords.GENERAL.add(w);
        }
        hasAuditData = true;
      });
    }

    if (data.missed_link_requests && Array.isArray(data.missed_link_requests)) {
      data.missed_link_requests.forEach(lr => {
        if (lr && typeof lr === "string" && lr.trim()) {
          linkRequests.add(lr.trim());
          hasAuditData = true;
        }
      });
    }

    if (data.missed_topics && Array.isArray(data.missed_topics)) {
      data.missed_topics.forEach(t => {
        if (t && typeof t === "string" && t.trim()) {
          topics.add(t.trim());
          hasAuditData = true;
        }
      });
    }

    if (data.missed_entities && Array.isArray(data.missed_entities)) {
      data.missed_entities.forEach(e => {
        if (e && typeof e === "string" && e.trim()) {
          entities.add(e.trim());
          hasAuditData = true;
        }
      });
    }

    if (data.missed_proactive_keywords && Array.isArray(data.missed_proactive_keywords)) {
      data.missed_proactive_keywords.forEach(p => {
        if (p && typeof p === "string" && p.trim()) {
          proactiveKeywords.add(p.trim().toLowerCase());
          hasAuditData = true;
        }
      });
    }

    if (data.audit_issues && Array.isArray(data.audit_issues)) {
      data.audit_issues.forEach(issue => {
        if (issue && issue.issue_type === "prompt_leakage" && issue.user_question) {
          promptLeakageQuestions.push(issue.user_question);
        }
      });
    }

    if (hasAuditData) {
      processedDocIds.push(doc.id);
    }
  });

  console.log(`Đã trích xuất dữ liệu từ ${processedDocIds.length} documents:`);
  console.log(`- DEV keywords: ${catKeywords.DEV.size}`);
  console.log(`- FINANCE keywords: ${catKeywords.FINANCE.size}`);
  console.log(`- SOCIAL keywords: ${catKeywords.SOCIAL.size}`);
  console.log(`- NEWS keywords: ${catKeywords.NEWS.size}`);
  console.log(`- GENERAL keywords: ${catKeywords.GENERAL.size}`);
  console.log(`- Missed link requests: ${linkRequests.size}`);
  console.log(`- Missed topics: ${topics.size}`);
  console.log(`- Missed entities: ${entities.size}`);
  console.log(`- Missed proactive keywords: ${proactiveKeywords.size}`);
  console.log(`- Prompt leakage: ${promptLeakageQuestions.length}`);

  // 2. Cập nhật bot_config trên cả 2 Firestore
  const targets = [
    { name: "LINE", db: lineDb },
    { name: "TELEGRAM", db: teleDb }
  ];

  for (const { name, db } of targets) {
    console.log(`\n=== Cập nhật bot_config cho ${name} ===`);
    const docRef = db.collection("system_configs").doc("bot_config");
    const docSnap = await docRef.get();
    const currentData = docSnap.exists ? docSnap.data() : {};

    const currentSearchKeywords = currentData.search_keywords || {};
    const updatedSearchKeywords = {
      DEV: mergeCategoryString(currentSearchKeywords.DEV, catKeywords.DEV),
      FINANCE: mergeCategoryString(currentSearchKeywords.FINANCE, catKeywords.FINANCE),
      SOCIAL: mergeCategoryString(currentSearchKeywords.SOCIAL, catKeywords.SOCIAL),
      NEWS: mergeCategoryString(currentSearchKeywords.NEWS, catKeywords.NEWS),
      GENERAL: mergeCategoryString(currentSearchKeywords.GENERAL, catKeywords.GENERAL)
    };

    let updatedLinkRequestsRegex = currentData.link_requests_regex || "xin link|cho link|gửi link|địa chỉ|url|link|cho xin|ở đâu|trang nào";
    if (linkRequests.size > 0) {
      updatedLinkRequestsRegex = mergeCategoryString(updatedLinkRequestsRegex, linkRequests);
    }

    const updatedTopics = mergeArray(currentData.standalone_topics || [], topics);
    const updatedProactive = mergeArray(currentData.proactive_trigger_words || [], proactiveKeywords);

    let updatedLeakBlacklist = currentData.leak_blacklist || [];
    if (promptLeakageQuestions.length > 0) {
      const newLeakWords = promptLeakageQuestions.map(q => q.toLowerCase().replace(/[.,?!]/g, "").trim());
      updatedLeakBlacklist = mergeArray(updatedLeakBlacklist, newLeakWords);
    }

    await docRef.set({
      search_keywords: updatedSearchKeywords,
      link_requests_regex: updatedLinkRequestsRegex,
      standalone_topics: updatedTopics,
      proactive_trigger_words: updatedProactive,
      leak_blacklist: updatedLeakBlacklist,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`✅ Cập nhật ${name} bot_config thành công:`);
    console.log(`  - DEV count: ${updatedSearchKeywords.DEV.split("|").length}`);
    console.log(`  - FINANCE count: ${updatedSearchKeywords.FINANCE.split("|").length}`);
    console.log(`  - SOCIAL count: ${updatedSearchKeywords.SOCIAL.split("|").length}`);
    console.log(`  - NEWS count: ${updatedSearchKeywords.NEWS.split("|").length}`);
    console.log(`  - GENERAL count: ${updatedSearchKeywords.GENERAL.split("|").length}`);
    console.log(`  - standalone_topics: ${updatedTopics.length}`);
    console.log(`  - proactive_trigger_words: ${updatedProactive.length}`);
    console.log(`  - leak_blacklist: ${updatedLeakBlacklist.length}`);
  }

  // 3. Dọn dẹp collection audit_logs (Inbox Zero)
  console.log("\n=== Bắt đầu dọn dẹp audit_logs (Inbox Zero) ===");
  let deletedDocsCount = 0;
  let updatedDocsCount = 0;

  for (const docId of processedDocIds) {
    const docRef = lineDb.collection("audit_logs").doc(docId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) continue;

    const data = docSnap.data();
    // Kiểm tra xem doc còn trường dữ liệu quan trọng nào khác không
    const remainingIssues = Array.isArray(data.audit_issues) && data.audit_issues.length > 0;
    const remainingLearnings = Array.isArray(data.audit_learnings) && data.audit_learnings.length > 0;
    const remainingSummary = !!data.summary;

    if (remainingIssues || remainingLearnings || remainingSummary) {
      // Chỉ xóa các trường đã xử lý
      await docRef.update({
        audit_keywords: FieldValue.delete(),
        missed_link_requests: FieldValue.delete(),
        missed_topics: FieldValue.delete(),
        missed_entities: FieldValue.delete(),
        missed_proactive_keywords: FieldValue.delete(),
        suggested_stopwords: FieldValue.delete()
      });
      updatedDocsCount++;
    } else {
      // Xóa hoàn toàn document vì không còn gì cần lưu trữ
      await docRef.delete();
      deletedDocsCount++;
    }
  }

  console.log(`✅ Hoàn thành dọn dẹp audit_logs:`);
  console.log(`  - Documents đã xóa hoàn toàn: ${deletedDocsCount}`);
  console.log(`  - Documents đã xóa trường audit: ${updatedDocsCount}`);
  console.log("=== HOÀN TẤT /update ===");
}

runUpdateAndClean()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Lỗi cập nhật:", err);
    process.exit(1);
  });
