const admin = require("firebase-admin");
const serviceAccount = require("../functions/config/serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://line-chatbot-gemini-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const rtdb = admin.database();

async function run() {
  const chatsSnap = await rtdb.ref("chats").once("value");
  const chats = chatsSnap.val();
  
  if (!chats) {
    console.log("No chats found.");
    process.exit(0);
  }
  
  // Tìm các chat có key là số (Telegram user ID thường là số)
  const teleChats = Object.keys(chats).filter(k => /^\d+$/.test(k) || k.startsWith("-100"));
  
  // Sort theo thời gian cập nhật gần nhất hoặc lấy một vài chat gần đây
  for (const chatId of teleChats) {
    const chat = chats[chatId];
    if (chat.messages) {
      const msgs = Object.values(chat.messages);
      if (msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.timestamp > Date.now() - 3600000) { // 1 hour
          console.log(`\nChat ID: ${chatId}`);
          msgs.slice(-5).forEach(m => {
            console.log(`[${new Date(m.timestamp).toLocaleTimeString()}] ${m.role}: ${m.content}`);
          });
        }
      }
    }
  }
  
  process.exit(0);
}

run();
