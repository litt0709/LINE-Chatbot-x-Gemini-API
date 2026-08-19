const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const appLine = admin.initializeApp({
  credential: admin.credential.cert(lineKey),
  databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "LINE_CONFIG");

const db = appLine.firestore();

async function run() {
  console.log("=== bot_config Firestore ===");
  const configDoc = await db.collection("system_configs").doc("bot_config").get();
  if (configDoc.exists) {
    const d = configDoc.data();
    console.log("link_requests_regex:", d.link_requests_regex);
    console.log("\nTất cả fields:");
    Object.entries(d).forEach(([k, v]) => {
      console.log(`  ${k}: ${JSON.stringify(v).substring(0, 200)}`);
    });
  }
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
