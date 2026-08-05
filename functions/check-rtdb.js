const admin = require("firebase-admin");
const serviceAccount = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://tele-ai-chatbot-default-rtdb.firebaseio.com"
});
const db = admin.database();
db.ref("chats/6128038753/messages").limitToLast(1).once("value").then(snap => {
  console.log("Last message:", snap.val());
  process.exit(0);
});
