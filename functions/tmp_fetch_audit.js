const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP");
const dbLine = appLine.firestore();
const teleKey = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const dbTele = appTele.firestore();

async function run() {
  const issues = [];
  try {
    const snapLine = await dbLine.collection("audit_logs").get();
    snapLine.forEach(doc => {
      const data = doc.data();
      if (data.audit_issues && data.audit_issues.length > 0) {
        data.audit_issues.forEach(issue => {
          issues.push({ docId: doc.id, app: "LINE", ...issue });
        });
      }
    });

    const snapTele = await dbTele.collection("audit_logs").get();
    snapTele.forEach(doc => {
      const data = doc.data();
      if (data.audit_issues && data.audit_issues.length > 0) {
        data.audit_issues.forEach(issue => {
          issues.push({ docId: doc.id, app: "TELE", ...issue });
        });
      }
    });

    console.log(JSON.stringify(issues, null, 2));
  } catch (error) {
    console.error("Error fetching audit logs:", error);
  }
}
run();
