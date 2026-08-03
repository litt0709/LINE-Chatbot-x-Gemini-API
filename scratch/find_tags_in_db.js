const admin = require("firebase-admin");

const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
const lineKey = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE");

async function checkCollection(db, platformName) {
  console.log(`\n=================== FIRESTORE: ${platformName} ===================`);
  const collections = ["users", "audit_logs", "user_profiles", "chats"];
  for (const colName of collections) {
    try {
      const snap = await db.collection(colName).get();
      console.log(`Collection '${colName}': ${snap.size} documents`);
      snap.forEach(doc => {
        const data = doc.data();
        const str = JSON.stringify(data);
        // Find tags like <...>
        const tagMatches = str.match(/<[A-Za-z0-9_\-\s="'\/]+>/g);
        if (tagMatches) {
          console.log(`\n[TAG MATCH FOUND] Doc ID: ${doc.id} in '${colName}'`);
          console.log(`  Tags found:`, [...new Set(tagMatches)]);
          if (data.messages && Array.isArray(data.messages)) {
            data.messages.forEach((m, i) => {
              if (m.text && /<[A-Za-z0-9_\-\s="'\/]+>/.test(m.text)) {
                console.log(`  Message #${i} (${m.role}):\n${m.text}\n`);
              }
              if (m.content && /<[A-Za-z0-9_\-\s="'\/]+>/.test(m.content)) {
                console.log(`  Message #${i} (${m.role}):\n${m.content}\n`);
              }
            });
          }
        }
      });
    } catch (e) {
      console.error(`Error reading ${colName}:`, e.message);
    }
  }
}

async function run() {
  await checkCollection(appTele.firestore(), "TELEGRAM");
  await checkCollection(appLine.firestore(), "LINE");
}

run().then(() => process.exit(0));
