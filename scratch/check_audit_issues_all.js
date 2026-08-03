const admin = require("firebase-admin");

const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
const lineKey = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE");

async function run() {
  console.log("=== Checking LINE audit_logs ===");
  const snapLine = await appLine.firestore().collection("audit_logs").get();
  let lineIssues = 0;
  snapLine.forEach(doc => {
    const data = doc.data();
    if (data.audit_issues && data.audit_issues.length > 0) {
      console.log(`Doc ID ${doc.id} has ${data.audit_issues.length} issues`);
      console.log(JSON.stringify(data.audit_issues, null, 2));
      lineIssues += data.audit_issues.length;
    }
  });
  console.log(`Total LINE audit_issues: ${lineIssues}`);

  console.log("\n=== Checking TELEGRAM audit_logs ===");
  const snapTele = await appTele.firestore().collection("audit_logs").get();
  let teleIssues = 0;
  snapTele.forEach(doc => {
    const data = doc.data();
    if (data.audit_issues && data.audit_issues.length > 0) {
      console.log(`Doc ID ${doc.id} has ${data.audit_issues.length} issues`);
      console.log(JSON.stringify(data.audit_issues, null, 2));
      teleIssues += data.audit_issues.length;
    }
  });
  console.log(`Total TELEGRAM audit_issues: ${teleIssues}`);
}

run().then(() => process.exit(0));
