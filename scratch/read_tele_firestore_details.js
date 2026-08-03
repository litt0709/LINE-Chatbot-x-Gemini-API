const admin = require("firebase-admin");

const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appTele = admin.initializeApp({
  credential: admin.credential.cert(teleKey)
}, "TELE_APP");

async function run() {
  const dbTele = appTele.firestore();
  const docs = ["-1003832428084", "-5496875515", "2140581850"];

  for (const docId of docs) {
    console.log(`\n=================== DOC ID: ${docId} ===================`);
    const docSnap = await dbTele.collection("users").doc(docId).get();
    if (!docSnap.exists) {
      console.log("Document does not exist");
      continue;
    }
    const data = docSnap.data();
    console.log("Keys in doc:", Object.keys(data));
    if (data.messages && Array.isArray(data.messages)) {
      console.log(`Total messages in array: ${data.messages.length}`);
      // Print last 20 messages
      const lastMsgs = data.messages.slice(-20);
      lastMsgs.forEach((m, idx) => {
        console.log(`\n--- Msg ${data.messages.length - 20 + idx} ---`);
        console.log(`Role: ${m.role || m.senderName}`);
        console.log(`Timestamp: ${m.timestamp ? new Date(m.timestamp).toLocaleString("vi-VN") : "N/A"}`);
        console.log(`Content:\n${m.content}`);
      });
    } else {
      console.log("No messages array in document. Raw data:", JSON.stringify(data, null, 2));
    }
  }
}

run().then(() => process.exit(0));
