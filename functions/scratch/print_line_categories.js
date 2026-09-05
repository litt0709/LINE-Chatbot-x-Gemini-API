const admin = require("firebase-admin");
const path = require("path");
const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

async function printCategories() {
  const doc = await appLine.firestore().collection("system_configs").doc("bot_config").get();
  const sk = doc.data().search_keywords || {};
  for (const cat of Object.keys(sk)) {
    console.log(`\n=== Category: ${cat} (Length: ${sk[cat].length}) ===`);
    console.log(sk[cat]);
  }
}

printCategories().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
