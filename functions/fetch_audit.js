const admin = require('firebase-admin');

// Ensure we are using the correct project
process.env.GCLOUD_PROJECT = 'tele-ai-chatbot';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'tele-ai-chatbot' });

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

(async () => {
  try {
    const snapshot = await db.collection('audit_logs').get();
    const issues = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.audit_issues && data.audit_issues.length > 0) {
        issues.push({ id: doc.id, issues: data.audit_issues });
      }
    });
    console.log(JSON.stringify(issues, null, 2));
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
})();
