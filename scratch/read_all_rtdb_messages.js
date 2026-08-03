const admin = require("firebase-admin");

const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
const lineKey = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

const appTele = admin.initializeApp({
  credential: admin.credential.cert(teleKey),
  databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "TELE_APP");

const appLine = admin.initializeApp({
  credential: admin.credential.cert(lineKey),
  databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "LINE_APP");

async function dumpChats(app, label) {
  console.log(`\n=================== ${label} RTDB CHATS ===================`);
  try {
    const rtdb = app.database();
    const snap = await rtdb.ref("chats").once("value");
    if (!snap.exists()) {
      console.log("No chats found.");
      return;
    }
    const chats = snap.val();
    for (const chatId of Object.keys(chats)) {
      const chat = chats[chatId];
      if (chat.messages) {
        const msgs = Object.values(chat.messages);
        console.log(`\n--- Chat ID: ${chatId} (${msgs.length} messages) ---`);
        msgs.forEach((m, idx) => {
          const timeStr = m.timestamp || m.createdAt ? new Date(m.timestamp || m.createdAt).toLocaleString("vi-VN") : "N/A";
          // Check for tags
          const text = m.text || m.content || "";
          const hasTag = /<[A-Za-z0-9_\-\s="'\/]+>/.test(text) || text.includes("</") || text.includes("/>");
          const tagNotice = hasTag ? " 🚨 [CONTAINS TAGS!]" : "";
          console.log(`[Msg #${idx} - ${timeStr}] ${m.role || m.senderName}${tagNotice}:`);
          console.log(text);
          console.log("-".repeat(40));
        });
      }
    }
  } catch (err) {
    console.error(`Error dumping ${label}:`, err.message);
  }
}

async function run() {
  await dumpChats(appTele, "TELEGRAM");
  await dumpChats(appLine, "LINE");
}

run().then(() => process.exit(0));
