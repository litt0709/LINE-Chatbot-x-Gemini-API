const admin = require("firebase-admin");

const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
const lineKey = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

const urlsToTest = [
  { name: "tele-rtdb-asia", key: teleKey, url: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app" },
  { name: "tele-io", key: teleKey, url: "https://tele-ai-chatbot-default-rtdb.firebaseio.com" },
  { name: "tele-proj-io", key: teleKey, url: "https://tele-ai-chatbot.firebaseio.com" },
  { name: "line-rtdb-asia", key: lineKey, url: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app" },
  { name: "line-gemini-asia", key: lineKey, url: "https://line-chatbot-gemini-default-rtdb.asia-southeast1.firebasedatabase.app" },
  { name: "line-io", key: lineKey, url: "https://line-ai-chatbot-eab18.firebaseio.com" }
];

async function testUrl(item, i) {
  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert(item.key),
      databaseURL: item.url
    }, `APP_${i}`);
    const rtdb = app.database();
    const snap = await Promise.race([
      rtdb.ref("chats").once("value"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout 3s")), 3000))
    ]);
    console.log(`[SUCCESS] ${item.name} (${item.url}) -> exists: ${snap.exists()}, keys count: ${snap.exists() ? Object.keys(snap.val() || {}).length : 0}`);
  } catch (err) {
    console.log(`[FAILED] ${item.name} (${item.url}) -> ${err.message}`);
  }
}

async function run() {
  for (let i = 0; i < urlsToTest.length; i++) {
    await testUrl(urlsToTest[i], i);
  }
}

run().then(() => process.exit(0));
