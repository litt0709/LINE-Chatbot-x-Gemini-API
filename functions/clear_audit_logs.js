const admin = require("firebase-admin");
const lineKey = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

// Initialize both Firebase projects
const lineApp = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");
const teleApp = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");

const dbLine = lineApp.firestore();
const dbTele = teleApp.firestore();

async function clearLogs(db, name) {
  const snap = await db.collection("audit_logs").get();
  if (snap.empty) {
    console.log(`[${name}] Không có log nào cần xóa.`);
    return;
  }
  const batch = db.batch();
  snap.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log(`[${name}] Đã xóa ${snap.size} audit logs.`);
}

async function run() {
  console.log("Đang dọn dẹp Audit Logs...");
  await clearLogs(dbLine, "LINE");
  await clearLogs(dbTele, "TELEGRAM");
  console.log("Hoàn tất dọn dẹp!");
  process.exit(0);
}

run().catch(console.error);
