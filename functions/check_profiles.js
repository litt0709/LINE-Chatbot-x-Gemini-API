const admin = require("firebase-admin");
const serviceAccount = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function check() {
  try {
    const snap = await db.collection("user_profiles").get();
    snap.forEach(doc => {
      const data = doc.data();
      if (data.real_name === "Lâm" || JSON.stringify(data).includes("Lâm")) {
        console.log(`ID: ${doc.id}, Data:`, data);
      }
    });
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

check();
