const admin = require("firebase-admin");
const lineKey = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

// Initialize both Firebase projects
const lineApp = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");
const teleApp = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");

const dbLine = lineApp.firestore();
const dbTele = teleApp.firestore();

async function clearLegacyHistory(db, name) {
  const usersSnap = await db.collection("users").get();
  let totalDeleted = 0;

  for (const userDoc of usersSnap.docs) {
    const historyRef = userDoc.ref.collection("history");
    const historySnap = await historyRef.get();
    
    if (!historySnap.empty) {
      const docs = historySnap.docs;
      const CHUNK_SIZE = 500;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const batch = db.batch();
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      totalDeleted += historySnap.size;
    }
  }
  console.log(`[${name}] Đã dọn dẹp tổng cộng ${totalDeleted} tin nhắn di sản từ subcollection history.`);
}

async function run() {
  console.log("Đang quét và dọn dẹp tàn dư (Legacy History)...");
  await clearLegacyHistory(dbLine, "LINE");
  await clearLegacyHistory(dbTele, "TELEGRAM");
  console.log("Hoàn tất dọn dẹp tàn dư!");
  process.exit(0);
}

run().catch(console.error);
