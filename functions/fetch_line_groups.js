const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const { rtdb } = require("./utils/db");

const checkChat = async () => {
  const chatsSnap = await rtdb.ref(`chats`).once("value");
  const chats = chatsSnap.val() || {};
  const groups = Object.keys(chats).filter(id => id.startsWith("C") || id.startsWith("R"));
  
  for (const groupId of groups) {
    console.log(`\n=== GROUP: ${groupId} ===`);
    const msgsSnap = await rtdb.ref(`chats/${groupId}/messages`).orderByKey().limitToLast(10).once("value");
    if (msgsSnap.exists()) {
      const msgs = msgsSnap.val();
      for (const key of Object.keys(msgs)) {
        const msg = msgs[key];
        console.log(`[${msg.createdAt}] ${msg.senderName || msg.role}: ${msg.text}`);
      }
    } else {
      console.log("No messages");
    }
  }
  process.exit(0);
};

checkChat().catch(e => {
  console.error(e);
  process.exit(1);
});
