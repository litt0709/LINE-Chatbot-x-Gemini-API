require('dotenv').config({ path: '.env.tele-ai-chatbot' });
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: "tele-ai-chatbot",
    databaseURL: process.env.DATABASE_URL
  });
}
const db = admin.firestore();

// Chat ID của cuộc hội thoại 1-1 từ log: 2140581850
const CHAT_ID = "2140581850";

async function clearHistory() {
  const ref = db.collection("users").doc(CHAT_ID);
  const doc = await ref.get();

  if (!doc.exists) {
    console.log(`Không tìm thấy document cho chat ${CHAT_ID}`);
    return;
  }

  console.log(`Tìm thấy session ${CHAT_ID}. Đang xóa lịch sử...`);

  // Xóa các trường lịch sử chat, giữ lại profile/participants
  await ref.set({
    messages: admin.firestore.FieldValue.delete(),
    rawMessages: admin.firestore.FieldValue.delete(),
    summaries: admin.firestore.FieldValue.delete(),
    hotTopic: admin.firestore.FieldValue.delete(),
  }, { merge: true });

  // Xóa subcollection rawMessages nếu có
  const rawRef = ref.collection("rawMessages");
  const rawSnap = await rawRef.get();
  if (!rawSnap.empty) {
    const batch = db.batch();
    rawSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    console.log(`Đã xóa ${rawSnap.size} rawMessages docs`);
  }

  console.log(`✅ Đã xóa lịch sử chat cho session: ${CHAT_ID}`);
  process.exit(0);
}

clearHistory().catch(e => { console.error(e); process.exit(1); });
