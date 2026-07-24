require("dotenv").config({ path: "./functions/.env.line-ai-chatbot-eab18" });
const { rtdb } = require("./functions/utils/db");

async function check() {
  const snap = await rtdb.ref("chats").once("value");
  const chats = snap.val();
  if (!chats) {
    console.log("No chats found.");
  } else {
    for (const [chatId, data] of Object.entries(chats)) {
      const msgCount = data.messages ? Object.keys(data.messages).length : 0;
      console.log(`Chat ${chatId}: ${msgCount} messages, metadata:`, data.metadata);
    }
  }
  process.exit(0);
}
check();
