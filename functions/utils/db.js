const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

const rtdb = admin.database();

/**
 * Thêm một tin nhắn vào mảng lịch sử của phiên (session).
 * (Giữ lại cho tương thích ngược nếu cần)
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

/**
 * Thêm một hoặc nhiều tin nhắn thô vào Realtime Database (Unlimited Writes).
 * @param {string} sessionId 
 * @param {...Object} messages
 */
const appendRawMessage = async (sessionId, ...messages) => {
  try {
    const ref = rtdb.ref(`chats/${sessionId}/messages`);
    const promises = messages.map(msg => ref.push(msg));
    await Promise.all(promises);
  } catch (error) {
    console.error(`[RTDB] Lỗi lưu tin nhắn thô ${sessionId}:`, error.message);
  }
};

/**
 * Lấy danh sách tin nhắn thô từ Realtime Database.
 * @param {string} sessionId 
 * @returns {Promise<Array>}
 */
const getRawMessages = async (sessionId) => {
  try {
    const snapshot = await rtdb.ref(`chats/${sessionId}/messages`).once('value');
    if (!snapshot.exists()) return [];
    
    // Convert object of objects to array
    const data = snapshot.val();
    return Object.keys(data).map(key => data[key]);
  } catch (error) {
    console.error(`[RTDB] Lỗi lấy tin nhắn thô ${sessionId}:`, error.message);
    return [];
  }
};

/**
 * Xóa toàn bộ tin nhắn thô của một session trên Realtime Database.
 * @param {string} sessionId 
 */
const clearRawMessages = async (sessionId) => {
  try {
    await rtdb.ref(`chats/${sessionId}/messages`).remove();
  } catch (error) {
    console.error(`[RTDB] Lỗi xóa tin nhắn thô ${sessionId}:`, error.message);
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

module.exports = { 
  db, 
  rtdb,
  FieldValue, 
  appendMessageToArray, 
  appendRawMessage,
  getRawMessages,
  clearRawMessages,
  getUserProfile, 
  saveUserProfile 
};

