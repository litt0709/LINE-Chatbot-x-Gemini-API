const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP2");
const dbLine = appLine.firestore();

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP2");
const dbTele = appTele.firestore();

async function run() {
  const result = {
    audit_keywords: [],
    missed_link_requests: [],
    missed_topics: [],
    missed_entities: [],
    prompt_leakage: [],
    document_ids: []
  };

  try {
    const snapLine = await dbLine.collection("audit_logs").get();
    snapLine.forEach(doc => {
      const data = doc.data();
      result.document_ids.push(doc.id);
      if (data.audit_keywords) result.audit_keywords.push(...data.audit_keywords);
      if (data.missed_link_requests) result.missed_link_requests.push(...data.missed_link_requests);
      if (data.missed_topics) result.missed_topics.push(...data.missed_topics);
      if (data.missed_entities) result.missed_entities.push(...data.missed_entities);
      if (data.audit_issues) {
        data.audit_issues.forEach(issue => {
          if (issue.issue_type === "prompt_leakage") {
            result.prompt_leakage.push(issue.user_question);
          }
        });
      }
    });

    const snapTele = await dbTele.collection("audit_logs").get();
    snapTele.forEach(doc => {
      const data = doc.data();
      result.document_ids.push(doc.id);
      if (data.audit_keywords) result.audit_keywords.push(...data.audit_keywords);
      if (data.missed_link_requests) result.missed_link_requests.push(...data.missed_link_requests);
      if (data.missed_topics) result.missed_topics.push(...data.missed_topics);
      if (data.missed_entities) result.missed_entities.push(...data.missed_entities);
      if (data.audit_issues) {
        data.audit_issues.forEach(issue => {
          if (issue.issue_type === "prompt_leakage") {
            result.prompt_leakage.push(issue.user_question);
          }
        });
      }
    });

    fs.writeFileSync(__dirname + "/update_data.json", JSON.stringify(result, null, 2));
    console.log("Successfully fetched update data. Docs processed:", result.document_ids.length);
    process.exit(0);
  } catch (error) {
    console.error("Error fetching update logs:", error);
    process.exit(1);
  }
}

run();
