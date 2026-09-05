const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

async function run() {
  const dbs = [
    { name: "LINE", firestore: appLine.firestore() },
    { name: "TELEGRAM", firestore: appTele.firestore() }
  ];

  for (const { name, firestore } of dbs) {
    console.log(`\n================ ${name} AUDIT DATA & BOT CONFIG ================`);
    
    // 1. Get bot_config
    const botConfigDoc = await firestore.collection("system_configs").doc("bot_config").get();
    if (botConfigDoc.exists) {
      console.log(`\nCurrent bot_config keys:`, Object.keys(botConfigDoc.data()));
      console.log(`Current bot_config data:`, JSON.stringify(botConfigDoc.data(), null, 2));
    } else {
      console.log(`\n[bot_config] doc NOT FOUND in system_configs!`);
    }

    // 2. Get audit_logs
    const auditLogsSnap = await firestore.collection("audit_logs").get();
    console.log(`\nTotal audit_logs docs: ${auditLogsSnap.size}`);
    auditLogsSnap.forEach(doc => {
      console.log(`\n--- Doc: ${doc.id} ---`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  }
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
