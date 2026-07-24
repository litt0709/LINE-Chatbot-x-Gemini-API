const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/snow/Documents/www/LINE-Chatbot/functions/.env.tele-ai-chatbot" });

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const { rtdb } = require("./utils/db");

const check = async () => {
  console.log("=== KIỂM TRA TRẠNG THÁI FACTS TRÊN RTDB ===");
  
  const pendingSnap = await rtdb.ref("facts/pending").once("value");
  console.log("\n1. Pending Facts:");
  if (pendingSnap.exists()) {
    console.log(JSON.stringify(pendingSnap.val(), null, 2));
  } else {
    console.log("Không có pending fact nào.");
  }

  const globalIndexSnap = await rtdb.ref("facts/global/index").once("value");
  const globalDetailSnap = await rtdb.ref("facts/global/detail").once("value");
  console.log("\n2. Global Facts Index:");
  if (globalIndexSnap.exists()) {
    console.log(JSON.stringify(globalIndexSnap.val(), null, 2));
  } else {
    console.log("Không có global fact index.");
  }
  
  console.log("\n3. Global Facts Detail:");
  if (globalDetailSnap.exists()) {
    console.log(JSON.stringify(globalDetailSnap.val(), null, 2));
  } else {
    console.log("Không có global fact detail.");
  }

  process.exit(0);
};

check().catch(e => {
  console.error(e);
  process.exit(1);
});
