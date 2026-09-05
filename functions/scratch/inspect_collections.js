const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

async function inspectAll() {
  const dbs = [
    { name: "LINE", firestore: appLine.firestore() },
    { name: "TELEGRAM", firestore: appTele.firestore() }
  ];

  for (const { name, firestore } of dbs) {
    console.log(`\n================ ${name} COLLECTIONS ================`);
    const collections = await firestore.listCollections();
    for (const col of collections) {
      const snap = await col.limit(5).get();
      console.log(`Collection: ${col.id}, sample size: ${snap.size}`);
    }
  }
}

inspectAll().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
