const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Dọn dẹp lịch sử chat, chỉ giữ lại N tin nhắn mới nhất để tối ưu dung lượng và chi phí Firestore.
 * @param {string} sessionId
 * @param {number} limit
 */
const pruneHistory = async (sessionId, limit = 50) => {
  try {
    const chatRef = db.collection("users").doc(sessionId).collection("history");
    const snapshot = await chatRef.orderBy("createdAt", "desc").get();
    
    if (snapshot.size <= limit) return;
    
    const batch = db.batch();
    const docsToDelete = snapshot.docs.slice(limit);
    docsToDelete.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    console.log(`[Firestore] Đã tự động xóa ${docsToDelete.length} tin nhắn cũ của session: ${sessionId}`);
  } catch (error) {
    console.error(`[Firestore] Lỗi tự động dọn dẹp lịch sử ${sessionId}:`, error.message);
  }
};

module.exports = { db, FieldValue, pruneHistory };

