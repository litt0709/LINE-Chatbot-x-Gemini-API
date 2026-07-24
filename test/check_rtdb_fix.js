require("dotenv").config({ path: ".env.line-ai-chatbot-eab18" });
const { db, rtdb } = require("./utils/db");

async function check() {
  try {
    const activeSnap = await rtdb.ref("active_sessions").once("value");
    console.log("Active sessions:", activeSnap.val());
    
    // Check DCL group - we don't know the exact ID, so we loop over chats
    const chatsSnap = await rtdb.ref("chats").once("value");
    const chats = chatsSnap.val() || {};
    
    for (const [chatId, chatData] of Object.entries(chats)) {
      const msgCount = chatData.messages ? Object.keys(chatData.messages).length : 0;
      console.log(`\n=== Chat ID (RTDB): ${chatId} ===`);
      console.log(`Messages count: ${msgCount}`);
      if (chatData.metadata) {
        console.log(`Metadata:`, chatData.metadata);
      }
    }
    
    // Also check Firestore users
    const usersSnap = await db.collection("users").orderBy("updatedAt", "desc").limit(5).get();
    for (const doc of usersSnap.docs) {
      console.log(`\n=== Chat ID (Firestore): ${doc.id} ===`);
      const data = doc.data();
      console.log(`Summaries count:`, data.summaries ? data.summaries.length : 0);
      
      const historySnap = await doc.ref.collection("history").orderBy("timestamp", "desc").limit(3).get();
      console.log(`History count:`, historySnap.size);
      for (const h of historySnap.docs) {
         console.log(` - ${h.data().timestamp} | ${h.data().role} | ${h.data().content.substring(0,50)}...`);
      }
    }
    
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
check();
