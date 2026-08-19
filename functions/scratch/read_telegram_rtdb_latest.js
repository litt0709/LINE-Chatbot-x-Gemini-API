const admin = require("firebase-admin");
const path = require("path");

const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));
const appTele = admin.initializeApp({
  credential: admin.credential.cert(teleKey),
  databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "TELE_CHECK");

const rtdb = appTele.database();

async function run() {
  console.log("=== Checking all chats in tele-ai-chatbot RTDB ===");
  const chatsSnap = await rtdb.ref("chats").once("value");
  if (chatsSnap.exists()) {
    const chats = chatsSnap.val();
    for (const [cid, cval] of Object.entries(chats)) {
      const msgs = cval.messages ? Object.values(cval.messages) : [];
      console.log(`Chat ID: ${cid} | Total msgs: ${msgs.length}`);
      if (msgs.length > 0) {
        msgs.slice(-5).forEach(m => {
          console.log(`  [${m.createdAt}] [${m.role}] [${m.senderName} (${m.senderId})]: ${m.text}`);
        });
      }
    }
  } else {
    console.log("No chats in RTDB");
  }

  console.log("\n=== Checking operational_logs in tele-ai-chatbot ===");
  const opSnap = await rtdb.ref("logs/operational_logs").once("value");
  if (opSnap.exists()) {
    console.log("Op logs keys:", Object.keys(opSnap.val()));
    const val = opSnap.val();
    const today = Object.keys(val).pop();
    console.log(`Latest date ${today}:`, JSON.stringify(val[today], null, 2));
  } else {
    console.log("No operational_logs");
  }

  process.exit(0);
}

run();
