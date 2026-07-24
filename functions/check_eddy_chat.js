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

const { rtdb, db } = require("./utils/db");

const checkChat = async () => {
  const EDDY_ID = "2140581850";
  console.log(`=== KIỂM TRA LỊCH SỬ CHAT CỦA EDDY (${EDDY_ID}) ===`);

  // 1. Check RTDB messages
  console.log("\n--- RTDB Messages (Last 10) ---");
  const rtdbSnap = await rtdb.ref(`chats/${EDDY_ID}/messages`).orderByKey().limitToLast(10).once("value");
  if (rtdbSnap.exists()) {
    const msgs = rtdbSnap.val();
    for (const [key, val] of Object.entries(msgs)) {
      console.log(`[${val.createdAt || ""}] ${val.role}: ${val.text || val.content}`);
    }
  } else {
    console.log("Không có tin nhắn trên RTDB.");
  }

  // 2. Check Firestore history
  console.log("\n--- Firestore History (Last 10) ---");
  const fsSnap = await db.collection("users").doc(EDDY_ID).collection("history").orderBy("timestamp", "desc").limit(10).get();
  if (!fsSnap.empty) {
    const docs = [];
    fsSnap.forEach(doc => docs.push(doc.data()));
    docs.reverse().forEach(data => {
      console.log(`[${data.timestamp}] ${data.role}: ${data.content}`);
    });
  } else {
    console.log("Không có lịch sử trên Firestore.");
  }

  process.exit(0);
};

checkChat().catch(e => {
  console.error(e);
  process.exit(1);
});
