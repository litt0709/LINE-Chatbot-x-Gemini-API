const axios = require("axios");

const LINE_HEADER = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
};

const getImageBinary = async (messageId) => {
  const originalImage = await axios({
    method: "get",
    headers: LINE_HEADER,
    url: `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    responseType: "arraybuffer"
  })
  return originalImage.data;
}

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


/**
 * Lấy thông tin cá nhân (Profile) của người dùng từ LINE API.
 * @param {string} userId - ID người dùng LINE
 * @param {string|null} groupId - ID nhóm chat (nếu có) để gọi API lấy thành viên nhóm
 * @returns {Promise<{displayName: string, userId: string}|null>}
 */
const getUserProfile = async (userId, groupId = null) => {
  try {
    const url = groupId 
      ? `https://api.line.me/v2/bot/group/${groupId}/member/${userId}`
      : `https://api.line.me/v2/bot/profile/${userId}`;
    const response = await axios({
      method: "get",
      url: url,
      headers: LINE_HEADER
    });
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

module.exports = { getImageBinary, reply, getUserProfile };
