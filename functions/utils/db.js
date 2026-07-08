const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Thêm một tin nhắn vào mảng lịch sử của phiên (session).
 * @param {string} sessionId
 * @param {Object} messageObj
 */
const appendMessageToArray = async (sessionId, messageObj) => {
  try {
    const sessionRef = db.collection("users").doc(sessionId);
    await sessionRef.set({
      messages: FieldValue.arrayUnion(messageObj)
    }, { merge: true });
  } catch (error) {
    console.error(`[Firestore] Lỗi thêm tin nhắn vào mảng ${sessionId}:`, error.message);
  }
};

module.exports = { db, FieldValue, appendMessageToArray };

