const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

async function fetchAuditLogs() {
  const dbs = [
    { name: "LINE", firestore: appLine.firestore() },
    { name: "TELEGRAM", firestore: appTele.firestore() }
  ];

  for (const { name, firestore } of dbs) {
    console.log(`\n================ ${name} AUDIT LOGS ================`);
    const snapshot = await firestore.collection("audit_logs").get();
    console.log(`Total documents in audit_logs: ${snapshot.size}`);

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`\n--- Doc ID: ${doc.id} ---`);
      console.log(`Timestamp: ${data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp) : "N/A"}`);
      console.log(`audit_keywords: ${JSON.stringify(data.audit_keywords || [])}`);
      console.log(`audit_issues: ${JSON.stringify(data.audit_issues || [], null, 2)}`);
      console.log(`audit_learnings: ${JSON.stringify(data.audit_learnings || [], null, 2)}`);
    });
  }
}

fetchAuditLogs().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
