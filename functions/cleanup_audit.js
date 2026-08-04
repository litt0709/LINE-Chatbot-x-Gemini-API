const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP");
const dbLine = appLine.firestore();

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const dbTele = appTele.firestore();

async function cleanup() {
  try {
    const snapLine = await dbLine.collection("audit_logs").get();
    let countLine = 0;
    for (const doc of snapLine.docs) {
      const data = doc.data();
      if (data.audit_issues) {
        await doc.ref.update({ audit_issues: admin.firestore.FieldValue.delete() });
        // Check if we should delete the doc entirely
        if (!data.audit_keywords && !data.missed_link_requests && !data.missed_topics) {
          await doc.ref.delete();
        }
        countLine++;
      }
    }
    
    const snapTele = await dbTele.collection("audit_logs").get();
    let countTele = 0;
    for (const doc of snapTele.docs) {
      const data = doc.data();
      if (data.audit_issues) {
        await doc.ref.update({ audit_issues: admin.firestore.FieldValue.delete() });
        // Check if we should delete the doc entirely
        if (!data.audit_keywords && !data.missed_link_requests && !data.missed_topics) {
          await doc.ref.delete();
        }
        countTele++;
      }
    }
    console.log(`Cleaned up ${countLine} LINE docs and ${countTele} TELE docs.`);
  } catch (error) {
    console.error("Error cleaning up audit logs:", error);
  }
}

cleanup();
