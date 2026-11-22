const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP_CLEANUP");
const db = appLine.firestore();
const { FieldValue } = admin.firestore;

const targetDocIds = ["rGhhtCROIGNzxDyMn3nv", "z0mlSasmLKEhktORFDIV"];

async function cleanAuditIssues() {
  console.log("=== Bắt đầu dọn dẹp audit_issues đã xử lý ===");

  for (const docId of targetDocIds) {
    const docRef = db.collection("audit_logs").doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      console.log(`Doc ${docId} không tồn tại.`);
      continue;
    }

    const data = docSnap.data();
    const hasKeywords = Array.isArray(data.audit_keywords) && data.audit_keywords.length > 0;
    const hasStopwords = Array.isArray(data.suggested_stopwords) && data.suggested_stopwords.length > 0;
    const hasProactive = Array.isArray(data.missed_proactive_keywords) && data.missed_proactive_keywords.length > 0;
    const hasLearnings = Array.isArray(data.audit_learnings) && data.audit_learnings.length > 0;

    const hasOtherData = hasKeywords || hasStopwords || hasProactive || hasLearnings;

    if (hasOtherData) {
      await docRef.update({
        audit_issues: FieldValue.delete()
      });
      console.log(`[Update] Đã xóa trường audit_issues trong doc ${docId} (giữ lại các dữ liệu audit khác).`);
    } else {
      await docRef.delete();
      console.log(`[Delete] Đã xóa hoàn toàn doc ${docId} vì không còn dữ liệu audit nào khác.`);
    }
  }

  console.log("=== Dọn dẹp hoàn tất ===");
}

cleanAuditIssues()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Lỗi dọn dẹp:", e);
    process.exit(1);
  });
