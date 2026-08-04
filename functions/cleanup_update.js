const admin = require("firebase-admin");

const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP");
const dbLine = appLine.firestore();

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const dbTele = appTele.firestore();

async function cleanup() {
  try {
    const fieldsToDelete = [
      "audit_keywords",
      "missed_link_requests",
      "missed_topics",
      "missed_entities",
      "missed_proactive_keywords"
    ];
    let countLine = 0;
    const snapLine = await dbLine.collection("audit_logs").get();
    for (const doc of snapLine.docs) {
      const data = doc.data();
      let shouldUpdate = false;
      let updates = {};
      
      fieldsToDelete.forEach(f => {
         if (data[f] !== undefined) {
            updates[f] = admin.firestore.FieldValue.delete();
            shouldUpdate = true;
         }
      });
      
      if (shouldUpdate) {
        await doc.ref.update(updates);
        // Check if anything else is left, if not, delete doc
        if (!data.audit_issues) { 
           await doc.ref.delete();
        }
        countLine++;
      }
    }
    
    let countTele = 0;
    const snapTele = await dbTele.collection("audit_logs").get();
    for (const doc of snapTele.docs) {
      const data = doc.data();
      let shouldUpdate = false;
      let updates = {};
      
      fieldsToDelete.forEach(f => {
         if (data[f] !== undefined) {
            updates[f] = admin.firestore.FieldValue.delete();
            shouldUpdate = true;
         }
      });
      
      if (shouldUpdate) {
        await doc.ref.update(updates);
        if (!data.audit_issues) {
           await doc.ref.delete();
        }
        countTele++;
      }
    }
    
    console.log(`Cleaned up update data in ${countLine} LINE docs and ${countTele} TELE docs.`);
  } catch (error) {
    console.error("Error cleaning up update logs:", error);
  }
}

cleanup();
