const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

const LINE_HEADER = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
};

const getImageBinary = async (messageId) => {
  try {
    const originalImage = await axios({
      method: "get",
      headers: LINE_HEADER,
      url: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
      responseType: "arraybuffer"
    });
    return originalImage.data;
  } catch (error) {
    console.error(`[LINE] Lỗi tải nội dung file/ảnh cho message ${messageId}:`, error.message);
    return null;
  }
};

const reply = async (token, payload) => {
  try {
    const response = await axios({
      method: "post",
      url: "https://api.line.me/v2/bot/message/reply",
      headers: LINE_HEADER,
      data: { replyToken: token, messages: payload }
    });
    // Trả về mảng ID tin nhắn đã gửi để có thể lưu vào Firestore (phục vụ tính năng quote/reply)
    return response.data?.sentMessages || [];
  } catch (error) {
    console.error("[LINE] Lỗi gửi reply:", error?.response?.data || error.message);
    return [];
  }
};



const profileCache = new Map();

/**
 * Lấy thông tin người dùng từ LINE (có cache trên RAM để giảm chi phí API và Compute).
 * @param {string} userId - ID người dùng LINE
 * @param {string|null} groupId - ID nhóm chat (nếu có) để gọi API lấy thành viên nhóm
 * @returns {Promise<{displayName: string, userId: string}|null>}
 */
const getUserProfile = async (userId, groupId = null) => {
  if (profileCache.has(userId)) {
    return profileCache.get(userId);
  }

  try {
    const url = groupId 
      ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
      : `https://api.line.me/v2/bot/profile/${userId}`;
    const response = await axios({
      method: "get",
      url: url,
      headers: LINE_HEADER
    });
    profileCache.set(userId, response.data);
    return response.data;
  } catch (error) {
    console.error("[LINE Profile] Lỗi lấy profile:", error?.response?.data || error.message);
    if (groupId) {
      try {
        const response = await axios({
          method: "get",
          url: `https://api.line.me/v2/bot/profile/${userId}`,
          headers: LINE_HEADER
        });
        return response.data;
      } catch (err) {
        console.error("[LINE Profile] Lỗi lấy profile thường:", err?.response?.data || err.message);
      }
    }
    return null;
  }
};

/**
 * Gửi tin nhắn chủ động (push) tới LINE.
 * @param {string} to - ID người nhận (userId hoặc groupId)
 * @param {Array} payload - Mảng tin nhắn
 */
const push = async (to, payload) => {
  try {
    await axios({
      method: "post",
      url: "https://api.line.me/v2/bot/message/push",
      headers: LINE_HEADER,
      data: { to: to, messages: payload }
    });
  } catch (error) {
    console.error("[LINE] Lỗi gửi push message:", error?.response?.data || error.message);
  }
};

const downloadMessageFile = async (messageId, fileName) => {
  const fileData = await getImageBinary(messageId);
  if (!fileData) return null;
  
  let ext = "";
  if (!fileName.includes(".")) {
    const bytes = new Uint8Array(fileData.slice(0, 4));
    if (bytes[0] === 0xFF && bytes[1] === 0xD8) ext = ".jpg";
    else if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) ext = ".png";
    else if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) ext = ".pdf";
    else if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) ext = ".xlsx"; // XLSX/DOCX/ZIP
  }

  const finalFileName = ext ? `${fileName}${ext}` : fileName;
  const localPath = path.join(os.tmpdir(), `${messageId}_${finalFileName}`);
  fs.writeFileSync(localPath, fileData);
  return localPath;
};

module.exports = { getImageBinary, downloadMessageFile, reply, getUserProfile, push };
