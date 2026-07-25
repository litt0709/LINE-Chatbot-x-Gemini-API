const admin = require("firebase-admin");
const serviceAccount = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function check() {
  try {
    const schedulesRef = db.collection("schedules");
    const snapshot = await schedulesRef.get();
    let found = false;
    snapshot.forEach(doc => {
      const data = doc.data();
      // Print out schedules for DCL group or similar (usually negative IDs for Telegram groups)
      console.log(`ID: ${doc.id}, userId: ${data.userId}, senderName: ${data.senderName}, platform: ${data.platform}, prompt: ${data.prompt}, type: ${data.type}`);
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

check();
