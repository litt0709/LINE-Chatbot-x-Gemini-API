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
    document_ids: {
      line: [],
      tele: []
    }
  };

  try {
    const snapLine = await dbLine.collection("audit_logs").get();
    snapLine.forEach(doc => {
      const data = doc.data();
      result.document_ids.line.push(doc.id);
      if (data.audit_keywords) result.audit_keywords.push(...data.audit_keywords);
      if (data.missed_link_requests) result.missed_link_requests.push(...data.missed_link_requests);
      if (data.missed_topics) result.missed_topics.push(...data.missed_topics);
    });

    const snapTele = await dbTele.collection("audit_logs").get();
    snapTele.forEach(doc => {
      const data = doc.data();
      result.document_ids.tele.push(doc.id);
      if (data.audit_keywords) result.audit_keywords.push(...data.audit_keywords);
      if (data.missed_link_requests) result.missed_link_requests.push(...data.missed_link_requests);
      if (data.missed_topics) result.missed_topics.push(...data.missed_topics);
    });

    fs.writeFileSync(__dirname + "/audit_data.json", JSON.stringify(result, null, 2));
    console.log("Successfully fetched audit data.");
  } catch (error) {
    console.error("Error fetching audit logs:", error);
  }
}

run();
