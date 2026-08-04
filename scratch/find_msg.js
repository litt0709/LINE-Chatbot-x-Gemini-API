const admin = require("firebase-admin");

if (admin.apps.length === 0) {
  admin.initializeApp({
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}
const rtdb = admin.database();

async function run() {
  const chatsSnap = await rtdb.ref("chats").once("value");
  const chats = chatsSnap.val();
  if (!chats) return process.exit(0);
  
  for (const [chatId, chat] of Object.entries(chats)) {
    if (chat.messages) {
      for (const msg of Object.values(chat.messages)) {
        if (msg.text && msg.text.includes("có tin gì mới không")) {
          console.log(`Found in chatId: ${chatId}`);
          console.log(`Msg:`, msg);
          
          // Print 3 previous messages
          const msgs = Object.values(chat.messages);
          const idx = msgs.indexOf(msg);
          console.log("HISTORY:");
          msgs.slice(Math.max(0, idx - 3), idx + 1).forEach(m => console.log(m));
        }
      }
    }
  }
  process.exit(0);
}
run();
