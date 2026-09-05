const admin = require("firebase-admin");
const path = require("path");
const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

async function analyzeAuditData() {
  const db = appLine.firestore();
  const snap = await db.collection("audit_logs").get();
  
  const allKeywords = [];
  const allMissedLinks = [];
  const allMissedTopics = [];
  const allMissedProactive = [];
  const allMissedEntities = [];
  const allPromptLeaks = [];

  snap.forEach(doc => {
    const data = doc.data();
    if (data.audit_keywords && Array.isArray(data.audit_keywords)) {
      allKeywords.push(...data.audit_keywords);
    }
    if (data.missed_link_requests && Array.isArray(data.missed_link_requests)) {
      allMissedLinks.push(...data.missed_link_requests);
    }
    if (data.missed_topics && Array.isArray(data.missed_topics)) {
      allMissedTopics.push(...data.missed_topics);
    }
    if (data.missed_proactive_keywords && Array.isArray(data.missed_proactive_keywords)) {
      allMissedProactive.push(...data.missed_proactive_keywords);
    }
    if (data.missed_entities && Array.isArray(data.missed_entities)) {
      allMissedEntities.push(...data.missed_entities);
    }
    if (data.audit_issues && Array.isArray(data.audit_issues)) {
      data.audit_issues.forEach(iss => {
        if (iss.issue_type === "prompt_leakage" || iss.type === "prompt_leakage") {
          allPromptLeaks.push(iss.user_question || iss.question || iss.user_message);
        }
      });
    }
  });

  console.log("=== ALL AUDIT KEYWORDS ===");
  console.log(JSON.stringify(allKeywords, null, 2));

  console.log("\n=== ALL MISSED LINK REQUESTS ===");
  console.log(JSON.stringify(allMissedLinks, null, 2));

  console.log("\n=== ALL MISSED TOPICS ===");
  console.log(JSON.stringify(allMissedTopics, null, 2));

  console.log("\n=== ALL MISSED PROACTIVE KEYWORDS ===");
  console.log(JSON.stringify(allMissedProactive, null, 2));

  console.log("\n=== ALL PROMPT LEAK QUESTIONS ===");
  console.log(JSON.stringify(allPromptLeaks, null, 2));
}

analyzeAuditData().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
