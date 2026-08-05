const admin = require("firebase-admin");
const serviceAccount = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  const usersRef = db.collection("users");
  const snapshot = await usersRef.get();
  
  console.log("Searching for DCL in user profiles...");
  snapshot.forEach(doc => {
    const data = doc.data();
    const strData = JSON.stringify(data).toLowerCase();
    if (strData.includes("dcl")) {
      console.log(`Found DCL in doc ID: ${doc.id}`);
      console.log(JSON.stringify(data, null, 2));
    }
  });

  const schedulesRef = db.collection("schedules");
  const snap = await schedulesRef.get();
  
  console.log("Searching for DCL in schedules...");
  snap.forEach(doc => {
    const data = doc.data();
    const strData = JSON.stringify(data).toLowerCase();
    if (strData.includes("dcl")) {
      console.log(`Found DCL in schedule ID: ${doc.id}`);
      console.log(JSON.stringify(data, null, 2));
    }
  });
}

run().catch(console.error);
