const admin = require("firebase-admin");
const path = require("path");
const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

async function checkFields() {
  const doc = await appLine.firestore().collection("system_configs").doc("bot_config").get();
  const d = doc.data();
  console.log("search_keywords:", JSON.stringify(d.search_keywords, null, 2));
  console.log("link_requests_regex:", d.link_requests_regex);
  console.log("standalone_topics:", JSON.stringify(d.standalone_topics, null, 2));
  console.log("proactive_trigger_words:", JSON.stringify(d.proactive_trigger_words, null, 2));
  console.log("leak_blacklist:", JSON.stringify(d.leak_blacklist, null, 2));
}

checkFields().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
