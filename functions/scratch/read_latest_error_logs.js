const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey), databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app" }, "TELE_APP");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey), databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app" }, "LINE_APP");

async function checkLatestLogs() {
  const dbs = [{ name: "TELE", rtdb: appTele.database(), firestore: appTele.firestore() }, { name: "LINE", rtdb: appLine.database(), firestore: appLine.firestore() }];

  for (const { name, rtdb, firestore } of dbs) {
    console.log(`\n================ ${name} LATEST LOGS ================`);
    
    // 1. Operational logs
    const opSnap = await rtdb.ref("logs/operational_logs").once("value");
    if (opSnap.exists()) {
      const dates = opSnap.val();
      const latestDateKey = Object.keys(dates).sort().pop();
      console.log(`Operational logs date: ${latestDateKey}`);
      const logsObj = dates[latestDateKey];
      const logs = Object.values(logsObj);
      console.log(`Total logs today: ${logs.length}`);
      const last10 = logs.slice(-10);
      last10.forEach((l, idx) => {
        console.log(`[${l.timestamp}] [${l.type || l.errorType}] ${l.message || JSON.stringify(l)}`);
        if (l.stack) console.log(`  Stack: ${l.stack}`);
        if (l.data) console.log(`  Data: ${JSON.stringify(l.data)}`);
      });
    }

    // 2. Check 1-on-1 chats in RTDB
    const chatsSnap = await rtdb.ref("chats").once("value");
    if (chatsSnap.exists()) {
      const chats = chatsSnap.val();
      for (const cid of Object.keys(chats)) {
        if (!cid.startsWith("-")) { // 1-on-1 chat usually positive ID
          const msgs = Object.values(chats[cid].messages || {});
          if (msgs.length > 0) {
            console.log(`\n1-on-1 Chat ID: ${cid} (Total msgs: ${msgs.length})`);
            const last5 = msgs.slice(-5);
            last5.forEach(m => {
              console.log(`  [${m.createdAt}] [${m.role}] [${m.senderName} (${m.senderId})]: ${m.text}`);
            });
          }
        }
      }
    }
  }
}

checkLatestLogs().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
