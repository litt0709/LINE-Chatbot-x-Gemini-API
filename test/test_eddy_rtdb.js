const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const rtdb = admin.database();
const chatId = "U6cc1a9cfda8d2f79d0aae1778becfb65";

async function run() {
  console.log("Fetching last 50 messages for Eddy...");
  const snap = await rtdb.ref(`chats/${chatId}/messages`).orderByKey().limitToLast(50).once("value");
  if (snap.exists()) {
    const msgs = Object.values(snap.val());
    msgs.forEach((m, i) => {
      console.log(`[${i}] role=${m.role} type=${m.mediaType || 'text'} text="${m.text}"`);
    });
    
    // Simulate fallback logic
    const lastMsgSnap = await rtdb.ref(`chats/${chatId}/messages`).orderByKey().limitToLast(2).once("value");
    const lastMsgs = Object.values(lastMsgSnap.val());
    const mediaMsg = lastMsgs.reverse().find(m => m.mediaId);
    console.log("Fallback logic found mediaMsg:", mediaMsg ? "YES" : "NO");
  } else {
    console.log("No messages found.");
  }
  process.exit(0);
}
run();
