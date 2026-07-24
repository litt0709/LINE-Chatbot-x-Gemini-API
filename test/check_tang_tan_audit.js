const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const dotenv = require("dotenv");
dotenv.config({ path: "./.env.tele-ai-chatbot" });

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  console.log("Đang quét audit_logs...");
  const snap = await db.collection("audit_logs").get();
  snap.forEach(doc => {
    const data = doc.data();
    const str = JSON.stringify(data).toLowerCase();
    if (str.includes("tang") || str.includes("openai")) {
      console.log(`Doc ID: ${doc.id}`);
      console.log(JSON.stringify(data, null, 2));
    }
  });
  console.log("Xong.");
  process.exit(0);
}

run().catch(console.error);
