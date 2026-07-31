const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");

const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP_CLEANUP");
const dbLine = appLine.firestore();

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP_CLEANUP");
const dbTele = appTele.firestore();

async function cleanupDB(db, appName) {
  const snap = await db.collection("audit_logs").get();
  for (const doc of snap.docs) {
    const data = doc.data();
    let hasDeletes = false;
    const updateObj = {};

    if (data.audit_keywords !== undefined) { updateObj.audit_keywords = FieldValue.delete(); hasDeletes = true; }
    if (data.missed_link_requests !== undefined) { updateObj.missed_link_requests = FieldValue.delete(); hasDeletes = true; }
    if (data.missed_topics !== undefined) { updateObj.missed_topics = FieldValue.delete(); hasDeletes = true; }
    if (data.missed_entities !== undefined) { updateObj.missed_entities = FieldValue.delete(); hasDeletes = true; }
    if (data.missed_proactive_keywords !== undefined) { updateObj.missed_proactive_keywords = FieldValue.delete(); hasDeletes = true; }
    
    // Leakage is part of audit_issues, we don't delete audit_issues here, but if there's none, it's fine.
    
    if (hasDeletes) {
      await db.collection("audit_logs").doc(doc.id).update(updateObj);
      console.log(`[${appName}] Đã xóa các trường đã update ở doc: ${doc.id}`);

      // Re-fetch to check if document is basically empty
      const updatedDoc = await db.collection("audit_logs").doc(doc.id).get();
      const updatedData = updatedDoc.data();
      
      const hasIssues = updatedData.audit_issues && updatedData.audit_issues.length > 0;
      const hasKeywords = updatedData.audit_keywords !== undefined;
      const hasLinkReqs = updatedData.missed_link_requests !== undefined;
      const hasTopics = updatedData.missed_topics !== undefined;
      const hasEntities = updatedData.missed_entities !== undefined;
      const hasProactive = updatedData.missed_proactive_keywords !== undefined;
      const hasStopwords = updatedData.suggested_stopwords !== undefined;
      
      if (!hasIssues && !hasKeywords && !hasLinkReqs && !hasTopics && !hasEntities && !hasProactive && !hasStopwords) {
        await db.collection("audit_logs").doc(doc.id).delete();
        console.log(`[${appName}] Xóa luôn document trống: ${doc.id}`);
      }
    }
  }
}

async function run() {
  console.log("Bắt đầu dọn dẹp các keyword đã xử lý...");
  await cleanupDB(dbLine, "LINE");
  await cleanupDB(dbTele, "TELEGRAM");
  console.log("Hoàn thành.");
}

run();
