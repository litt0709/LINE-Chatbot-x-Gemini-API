const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP");
const dbLine = appLine.firestore();

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const dbTele = appTele.firestore();

async function run() {
  const result = {
    audit_keywords: [],
    missed_link_requests: [],
    missed_topics: [],
    missed_entities: [],
    missed_proactive_keywords: [],
    prompt_leakages: [],
    document_ids: { line: [], tele: [] },
    bot_config: null
  };

  try {
    const snapLine = await dbLine.collection("audit_logs").get();
    snapLine.forEach(doc => {
      const data = doc.data();
      let hasData = false;
      if (data.audit_keywords && data.audit_keywords.length > 0) { result.audit_keywords.push(...data.audit_keywords); hasData = true; }
      if (data.missed_link_requests && data.missed_link_requests.length > 0) { result.missed_link_requests.push(...data.missed_link_requests); hasData = true; }
      if (data.missed_topics && data.missed_topics.length > 0) { result.missed_topics.push(...data.missed_topics); hasData = true; }
      if (data.missed_entities && data.missed_entities.length > 0) { result.missed_entities.push(...data.missed_entities); hasData = true; }
      if (data.missed_proactive_keywords && data.missed_proactive_keywords.length > 0) { result.missed_proactive_keywords.push(...data.missed_proactive_keywords); hasData = true; }
      if (data.audit_issues && data.audit_issues.length > 0) {
        data.audit_issues.forEach(issue => {
          if (issue.issue_type === "prompt_leakage") {
            result.prompt_leakages.push(issue.user_question);
            hasData = true;
          }
        });
      }
      if (hasData) result.document_ids.line.push(doc.id);
    });

    const snapTele = await dbTele.collection("audit_logs").get();
    snapTele.forEach(doc => {
      const data = doc.data();
      let hasData = false;
      if (data.audit_keywords && data.audit_keywords.length > 0) { result.audit_keywords.push(...data.audit_keywords); hasData = true; }
      if (data.missed_link_requests && data.missed_link_requests.length > 0) { result.missed_link_requests.push(...data.missed_link_requests); hasData = true; }
      if (data.missed_topics && data.missed_topics.length > 0) { result.missed_topics.push(...data.missed_topics); hasData = true; }
      if (data.missed_entities && data.missed_entities.length > 0) { result.missed_entities.push(...data.missed_entities); hasData = true; }
      if (data.missed_proactive_keywords && data.missed_proactive_keywords.length > 0) { result.missed_proactive_keywords.push(...data.missed_proactive_keywords); hasData = true; }
      if (data.audit_issues && data.audit_issues.length > 0) {
        data.audit_issues.forEach(issue => {
          if (issue.issue_type === "prompt_leakage") {
            result.prompt_leakages.push(issue.user_question);
            hasData = true;
          }
        });
      }
      if (hasData) result.document_ids.tele.push(doc.id);
    });

    const configSnap = await dbLine.collection("system_configs").doc("bot_config").get();
    if (configSnap.exists) {
      result.bot_config = configSnap.data();
    }

    fs.writeFileSync(__dirname + "/update_data.json", JSON.stringify(result, null, 2));
    console.log("Successfully fetched update data.");
  } catch (error) {
    console.error("Error fetching update logs:", error);
  }
}

run();
