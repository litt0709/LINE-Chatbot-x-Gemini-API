const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const getAuditLogs = async () => {
  const snap = await db.collection("audit_logs").orderBy("timestamp", "desc").limit(5).get();
  if (snap.empty) {
    console.log("No audit logs found.");
    process.exit(0);
  }

  snap.forEach(doc => {
    const data = doc.data();
    if (data.audit_issues && data.audit_issues.length > 0) {
      console.log(`\n=== AUDIT LOG [${data.timestamp}] (Session: ${data.sessionId}) ===`);
      console.log(JSON.stringify(data.audit_issues, null, 2));
    }
  });
  
  process.exit(0);
};

getAuditLogs().catch(e => {
  console.error(e);
  process.exit(1);
});
