const admin = require("firebase-admin");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
}

const db = admin.firestore();

async function cleanup() {
  try {
    const logsRef = db.collection("audit_logs");
    const snapshot = await logsRef.get();
    let count = 0;
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updates = {};
      
      if (data.audit_keywords) updates.audit_keywords = admin.firestore.FieldValue.delete();
      if (data.missed_link_requests) updates.missed_link_requests = admin.firestore.FieldValue.delete();
      if (data.missed_topics) updates.missed_topics = admin.firestore.FieldValue.delete();
      if (data.missed_entities) updates.missed_entities = admin.firestore.FieldValue.delete();
      if (data.missed_proactive_keywords) updates.missed_proactive_keywords = admin.firestore.FieldValue.delete();
      
      if (Object.keys(updates).length > 0) {
        await doc.ref.update(updates);
        count++;
        
        // Cập nhật lại data mới để kiểm tra doc có rỗng không
        const newDoc = await doc.ref.get();
        const newData = newDoc.data();
        if (Object.keys(newData).length === 0 || (Object.keys(newData).length === 1 && newData.timestamp)) {
          // Xóa luôn document nếu rỗng
          await doc.ref.delete();
          console.log(`Deleted empty document ${doc.id}`);
        }
      }
    }
    
    console.log(`Cleanup completed! Updated ${count} documents.`);
    process.exit(0);
  } catch (error) {
    console.error("Error cleaning up:", error);
    process.exit(1);
  }
}

cleanup();
