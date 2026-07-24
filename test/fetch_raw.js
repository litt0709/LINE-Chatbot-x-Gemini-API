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

const checkChat = async () => {
  const EDDY_ID = "2140581850";
  const rtdbSnap = await rtdb.ref(`chats/${EDDY_ID}/messages`).orderByKey().limitToLast(15).once("value");
  console.log(JSON.stringify(rtdbSnap.val(), null, 2));
  process.exit(0);
};

checkChat().catch(e => {
  console.error(e);
  process.exit(1);
});
