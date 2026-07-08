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

const getUserProfile = async (userId) => {
  try {
    const doc = await db.collection("user_profiles").doc(String(userId)).get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error(`[Firestore] Lỗi đọc profile User ${userId}:`, error.message);
    return null;
  }
};

const saveUserProfile = async (userId, data) => {
  try {
    await db.collection("user_profiles").doc(String(userId)).set(data, { merge: true });
    console.log(`[Firestore] Đã lưu profile User ${userId}:`, data);
  } catch (error) {
    console.error(`[Firestore] Lỗi lưu profile User ${userId}:`, error.message);
  }
};

module.exports = { db, FieldValue, appendMessageToArray, getUserProfile, saveUserProfile };

