const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");

const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP");
const dbLine = appLine.firestore();

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const dbTele = appTele.firestore();

async function cleanupDB(db, appName) {
  const snap = await db.collection("audit_logs").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.audit_issues) {
      await db.collection("audit_logs").doc(doc.id).update({
        audit_issues: FieldValue.delete()
      });
      console.log(`[${appName}] Đã xóa audit_issues ở doc: ${doc.id}`);

      // Kiểm tra xem document còn dữ liệu audit nào khác không
      const hasKeywords = data.audit_keywords && data.audit_keywords.length > 0;
      const hasMissedLinks = data.missed_link_requests && data.missed_link_requests.length > 0;
      const hasMissedTopics = data.missed_topics && data.missed_topics.length > 0;
      
      if (!hasKeywords && !hasMissedLinks && !hasMissedTopics) {
        await db.collection("audit_logs").doc(doc.id).delete();
        console.log(`[${appName}] Xóa luôn document trống: ${doc.id}`);
      }
    }
  }
}

async function run() {
  console.log("Bắt đầu dọn dẹp audit_logs...");
  await cleanupDB(dbLine, "LINE");
  await cleanupDB(dbTele, "TELEGRAM");
  console.log("Hoàn thành.");
}

run();
