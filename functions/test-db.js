const admin = require("firebase-admin");
const serviceAccount = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
console.log("DB URL is:", admin.app().options.databaseURL);
