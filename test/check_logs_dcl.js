const { db } = require("./functions/utils/db");

async function check() {
  try {
    const snapshot = await db.collection("users").orderBy("updatedAt", "desc").limit(10).get();
    for (const doc of snapshot.docs) {
      console.log(`\n=== Chat ID: ${doc.id} ===`);
      
      const historySnap = await db.collection("users").doc(doc.id).collection("history").orderBy("timestamp", "desc").limit(15).get();
      const history = historySnap.docs.map(d => d.data()).reverse();
      
      for (const msg of history) {
        console.log(`[${msg.timestamp}] ${msg.role}: ${msg.content.substring(0, 300).replace(/\n/g, ' ')}`);
      }
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}
check();
