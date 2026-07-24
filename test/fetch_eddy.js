require("dotenv").config({ path: "./.env.line-ai-chatbot-eab18" });
const { rtdb } = require("./utils/db");

async function check() {
  const eddyId = "U6cc1a9cfda8d2f79d0aae1778becfb65";
  const snap = await rtdb.ref(`chats/${eddyId}/messages`).once("value");
  const msgs = snap.val();
  if (!msgs) {
    console.log("No messages found in RTDB for Eddy.");
  } else {
    Object.values(msgs).forEach(m => {
      if (m.text && m.text.toLowerCase().includes("dương")) {
        console.log(`[${m.role}] ${m.text}`);
      }
    });
  }
  process.exit(0);
}
check();
