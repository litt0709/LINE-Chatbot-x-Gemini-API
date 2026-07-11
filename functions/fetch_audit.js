const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  console.log("Fetching audit_logs...");
  const snapshot = await db.collection("audit_logs").get();
  
  if (snapshot.empty) {
    console.log("No audit logs found. The database is empty.");
    process.exit(0);
  }
  
  const keywords = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.audit_keywords && Array.isArray(data.audit_keywords)) {
      keywords.push(...data.audit_keywords);
    }
  });
  
  console.log("=== KEYWORDS FOUND ===");
  console.log(JSON.stringify(keywords, null, 2));
  console.log("======================");
  process.exit(0);
}

run().catch(console.error);
