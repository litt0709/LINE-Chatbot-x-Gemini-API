const admin = require('./node_modules/firebase-admin');
const serviceAccount = require('./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function run() {
  try {
    const snapshot = await db.collection('audit_logs').get();
    if (snapshot.empty) {
      console.log(JSON.stringify({ empty: true }));
      return;
    }
    
    let logs = [];
    snapshot.forEach(doc => {
      logs.push({ id: doc.id, ...doc.data() });
    });
    console.log(JSON.stringify({ empty: false, logs }));
  } catch (error) {
    console.error("Error fetching audit logs: ", error);
  }
}

run();
