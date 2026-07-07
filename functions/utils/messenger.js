const axios = require("axios");

const PAGE_ACCESS_TOKEN = process.env.MESSENGER_PAGE_ACCESS_TOKEN;
const MESSENGER_GRAPH_URL = "https://graph.facebook.com/v19.0/me/messages";

/**
 * Gửi tin nhắn văn bản phản hồi tới Facebook Messenger.
 * @param {string} recipientId - ID của người dùng trên Messenger (PSID)
 * @param {string} text - Nội dung phản hồi
 */
const reply = async (recipientId, text) => {
  if (!PAGE_ACCESS_TOKEN) {
    console.error("[Messenger] MESSENGER_PAGE_ACCESS_TOKEN chưa được cấu hình.");
    return;
  }

  // Messenger hỗ trợ tối đa 2000 ký tự cho một tin nhắn văn bản.
  const truncatedText = text.length > 2000 ? text.slice(0, 1997) + "..." : text;

  try {
    await axios.post(MESSENGER_GRAPH_URL, {
      recipient: { id: recipientId },
      message: { text: truncatedText },
      messaging_type: "RESPONSE"
    }, {
      params: { access_token: PAGE_ACCESS_TOKEN }
    });
  } catch (error) {
    console.error("[Messenger] Lỗi gửi tin nhắn:", error?.response?.data || error.message);
  }
};

/**
 * Gửi hành động chat (ví dụ: đang gõ phím, đã xem)
 * @param {string} recipientId - ID người dùng
 * @param {string} action - 'mark_seen', 'typing_on', 'typing_off'
 */
const sendAction = async (recipientId, action = "mark_seen") => {
  if (!PAGE_ACCESS_TOKEN) return;

  try {
    await axios.post(MESSENGER_GRAPH_URL, {
      recipient: { id: recipientId },
      sender_action: action
    }, {
      params: { access_token: PAGE_ACCESS_TOKEN }
    });
  } catch (error) {
    console.error(`[Messenger] Lỗi gửi action ${action}:`, error?.response?.data || error.message);
  }
};

/**
 * Lấy Profile của User từ Graph API (tuỳ chọn)
 */
const getUserProfile = async (recipientId) => {
  if (!PAGE_ACCESS_TOKEN) return null;
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/${recipientId}`, {
      params: { 
        fields: "first_name,last_name", 
        access_token: PAGE_ACCESS_TOKEN 
      }
    });
    const { first_name, last_name } = res.data;
    if (first_name || last_name) {
       return [last_name, first_name].filter(Boolean).join(" ");
    }
    return "User";
  } catch (error) {
    console.error("[Messenger] Lỗi lấy user profile:", error.message);
    return "User";
  }
};

module.exports = { reply, sendAction, getUserProfile };
