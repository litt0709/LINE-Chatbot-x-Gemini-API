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
 * @param {number|null} limit - Số tin nhắn gần nhất cần lấy. Nếu null, lấy toàn bộ (dùng cho summarization/cleanup).
 * @returns {Promise<Array>}
 */
const getRawMessages = async (sessionId, limit = null) => {
  try {
    let ref = rtdb.ref(`chats/${sessionId}/messages`);
    if (limit) ref = ref.limitToLast(limit);
    const snapshot = await ref.once('value');
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

const metadataCache = {};

/**
 * Đăng ký session đang hoạt động vào danh mục RTDB
 */
const registerActiveSession = async (sessionId) => {
  try {
    await rtdb.ref(`active_sessions/${sessionId}`).set(true);
  } catch (error) {
    console.error(`[RTDB] Lỗi đăng ký active session ${sessionId}:`, error.message);
  }
};

/**
 * Lấy toàn bộ danh sách các session đang hoạt động từ RTDB
 */
const getActiveSessions = async () => {
  try {
    const snap = await rtdb.ref("active_sessions").once("value");
    if (!snap.exists()) return [];
    return Object.keys(snap.val());
  } catch (error) {
    console.error(`[RTDB] Lỗi lấy danh sách active sessions:`, error.message);
    return [];
  }
};

/**
 * Xóa session khỏi danh mục hoạt động trên RTDB
 */
const deregisterActiveSession = async (sessionId) => {
  try {
    await rtdb.ref(`active_sessions/${sessionId}`).remove();
  } catch (error) {
    console.error(`[RTDB] Lỗi hủy đăng ký active session ${sessionId}:`, error.message);
  }
};

/**
 * Lấy Metadata (participants & hotTopic) của Session từ RTDB có Cache RAM 5 phút
 */
const getSessionMetadata = async (sessionId) => {
  try {
    const now = Date.now();
    if (metadataCache[sessionId] && now < metadataCache[sessionId].expiresAt) {
      return metadataCache[sessionId].data;
    }

    const ref = rtdb.ref(`chats/${sessionId}/metadata`);
    const snap = await ref.once('value');
    const data = snap.val() || { participants: {}, hotTopic: "" };

    metadataCache[sessionId] = {
      data: data,
      expiresAt: now + 5 * 60 * 1000 // Cache 5 phút
    };
    return data;
  } catch (error) {
    console.error(`[RTDB] Lỗi lấy metadata cho session ${sessionId}:`, error.message);
    return { participants: {}, hotTopic: "" };
  }
};

/**
 * Cập nhật Metadata lên RTDB & RAM Cache
 */
const updateSessionMetadata = async (sessionId, updateObj) => {
  try {
    const ref = rtdb.ref(`chats/${sessionId}/metadata`);
    await ref.update(updateObj);

    // Cập nhật RAM Cache
    if (metadataCache[sessionId]) {
      metadataCache[sessionId].data = {
        ...metadataCache[sessionId].data,
        ...updateObj
      };
    } else {
      metadataCache[sessionId] = {
        data: updateObj,
        expiresAt: Date.now() + 5 * 60 * 1000
      };
    }
  } catch (error) {
    console.error(`[RTDB] Lỗi cập nhật metadata cho session ${sessionId}:`, error.message);
  }
};

/**
 * Lấy danh sách participants toàn cục từ RTDB có Cache RAM
 */
const getGlobalParticipants = async (platform) => {
  const cacheKey = `global_${platform}`;
  const now = Date.now();
  if (metadataCache[cacheKey] && now < metadataCache[cacheKey].expiresAt) {
    return metadataCache[cacheKey].data;
  }

  try {
    const ref = rtdb.ref(`metadata/${platform}_participants`);
    const snap = await ref.once('value');
    const data = snap.val() || {};

    metadataCache[cacheKey] = {
      data: data,
      expiresAt: now + 5 * 60 * 1000
    };
    return data;
  } catch (error) {
    console.error(`[RTDB] Lỗi lấy global participants cho ${platform}:`, error.message);
    return {};
  }
};

/**
 * Lưu danh sách participants toàn cục vào RTDB
 */
const saveGlobalParticipants = async (platform, data) => {
  const cacheKey = `global_${platform}`;
  try {
    const ref = rtdb.ref(`metadata/${platform}_participants`);
    await ref.set(data);

    metadataCache[cacheKey] = {
      data: data,
      expiresAt: Date.now() + 5 * 60 * 1000
    };
  } catch (error) {
    console.error(`[RTDB] Lỗi lưu global participants cho ${platform}:`, error.message);
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
  saveUserProfile,
  registerActiveSession,
  getActiveSessions,
  deregisterActiveSession,
  getSessionMetadata,
  updateSessionMetadata,
  getGlobalParticipants,
  saveGlobalParticipants
};

