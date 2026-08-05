const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = admin.database();

async function run() {
  try {
    const ref = db.ref("chats/-1003832428084/messages");
    const snapshot = await ref.orderByChild("createdAt").limitToLast(10).once("value");
    console.log("LAST 10 MESSAGES:");
    const messages = snapshot.val();
    if (messages) {
      Object.keys(messages).forEach(k => {
        const m = messages[k];
        console.log(`[${m.createdAt}] ${m.role}: ${m.text ? m.text.substring(0, 50) : ""}...`);
      });
    } else {
      console.log("No messages found.");
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
run();
