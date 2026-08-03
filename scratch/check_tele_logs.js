const admin = require("firebase-admin");

const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
const lineKey = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

const appTele = admin.initializeApp({
  credential: admin.credential.cert(teleKey),
  databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "TELE_APP");

const appLine = admin.initializeApp({
  credential: admin.credential.cert(lineKey),
  databaseURL: "https://line-chatbot-gemini-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "LINE_APP");

async function run() {
  console.log("=================== TELEGRAM FIRESTORE USERS ===================");
  try {
    const dbTele = appTele.firestore();
    const snap = await dbTele.collection("users").get();
    console.log(`Telegram Firestore users count: ${snap.size}`);
    snap.forEach(doc => {
      console.log(`Doc ID: ${doc.id}`);
      const data = doc.data();
      if (data.messages && Array.isArray(data.messages)) {
        console.log(`  Messages count: ${data.messages.length}`);
        data.messages.slice(-5).forEach(m => {
          console.log(`  [${m.role || m.senderName}]: ${m.content}`);
        });
      }
    });
  } catch (err) {
    console.error("Tele Firestore error:", err.message);
  }

  console.log("\n=================== TELEGRAM FIRESTORE AUDIT LOGS ===================");
  try {
    const dbTele = appTele.firestore();
    const snap = await dbTele.collection("audit_logs").get();
    console.log(`Telegram audit_logs count: ${snap.size}`);
    snap.forEach(doc => {
      console.log(`Doc ID: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  } catch (err) {
    console.error("Tele Audit Logs error:", err.message);
  }

  console.log("\n=================== LINE FIRESTORE AUDIT LOGS ===================");
  try {
    const dbLine = appLine.firestore();
    const snap = await dbLine.collection("audit_logs").get();
    console.log(`Line audit_logs count: ${snap.size}`);
    snap.forEach(doc => {
      const data = doc.data();
      if (data.audit_issues && data.audit_issues.length > 0) {
        console.log(`Doc ID: ${doc.id} - issues count: ${data.audit_issues.length}`);
        console.log(JSON.stringify(data.audit_issues, null, 2));
      }
    });
  } catch (err) {
    console.error("Line Audit Logs error:", err.message);
  }

  console.log("\n=================== LINE RTDB CHATS ===================");
  try {
    const rtdbLine = appLine.database();
    const chatsSnap = await rtdbLine.ref("chats").once("value");
    const chats = chatsSnap.val() || {};
    for (const chatId of Object.keys(chats)) {
      const chat = chats[chatId];
      if (chat.messages) {
        const msgs = Object.values(chat.messages);
        console.log(`\nChat ID: ${chatId} (${msgs.length} msgs)`);
        msgs.slice(-10).forEach(m => {
          const timeStr = m.timestamp ? new Date(m.timestamp).toLocaleString("vi-VN") : "no-time";
          console.log(`  [${timeStr}] ${m.role || m.senderName}: ${m.content}`);
        });
      }
    }
  } catch (err) {
    console.error("Line RTDB error:", err.message);
  }
}

run().then(() => process.exit(0));
