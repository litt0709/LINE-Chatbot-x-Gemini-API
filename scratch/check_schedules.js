const admin = require("firebase-admin");
const serviceAccount = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app" // Need to make sure this is correct. Let me check firebase project config.
  });
}

const rtdb = admin.database();

async function check() {
  try {
    const snap = await rtdb.ref("schedules").once("value");
    const val = snap.val();
    if (!val) {
      console.log("No schedules found in RTDB.");
    } else {
      for (const id in val) {
        console.log(`ID: ${id}, Data:`, val[id]);
      }
    }
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

check();
