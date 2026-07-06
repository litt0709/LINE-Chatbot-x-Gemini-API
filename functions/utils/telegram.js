const axios = require("axios");

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BASE_URL = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

/**
 * Gửi tin nhắn văn bản phản hồi tới Telegram.
 * @param {number|string} chatId - ID của phòng chat hoặc người dùng
 * @param {string} text - Nội dung phản hồi
 */
const reply = async (chatId, text) => {
  if (!TELEGRAM_TOKEN) {
    console.error("[Telegram] BOT_TOKEN chưa được cấu hình.");
    return;
  }

  // Chuyển đổi định dạng Markdown **chữ** thành HTML <b>chữ</b> để hiển thị in đậm trên Telegram
  const htmlText = text.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

  try {
    await axios.post(`${TELEGRAM_BASE_URL}/sendMessage`, {
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML"
    });
  } catch (error) {
    console.error("[Telegram] Lỗi gửi tin nhắn:", error?.response?.data || error.message);
  }
};

/**
 * Tải ảnh nhị phân từ Telegram thông qua fileId.
 * @param {string} fileId - ID của file ảnh trên máy chủ Telegram
 * @returns {Promise<Buffer>} Dữ liệu ảnh nhị phân
 */
const getImageBinary = async (fileId) => {
  if (!TELEGRAM_TOKEN) {
    throw new Error("[Telegram] BOT_TOKEN chưa được cấu hình.");
  }

  try {
    // 1. Lấy đường dẫn file từ Telegram
    const fileResponse = await axios.get(`${TELEGRAM_BASE_URL}/getFile`, {
      params: { file_id: fileId }
    });
    const filePath = fileResponse.data.result.file_path;

    // 2. Tải file nhị phân về
    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${filePath}`;
    const imageResponse = await axios.get(downloadUrl, {
      responseType: "arraybuffer"
    });
    return imageResponse.data;
  } catch (error) {
    console.error("[Telegram] Lỗi tải file ảnh:", error?.response?.data || error.message);
    throw error;
  }
};

/**
 * Yêu cầu Bot tự động rời khỏi một nhóm chat hoặc kênh.
 * @param {number|string} chatId - ID của nhóm hoặc kênh cần rời
 */
const leaveChat = async (chatId) => {
  if (!TELEGRAM_TOKEN) return;
  try {
    await axios.post(`${TELEGRAM_BASE_URL}/leaveChat`, {
      chat_id: chatId
    });
    console.log(`[Telegram] Bot đã tự động rời khỏi phòng chat: ${chatId}`);
  } catch (error) {
    console.error("[Telegram] Lỗi rời phòng chat:", error?.response?.data || error.message);
  }
};

module.exports = { reply, getImageBinary, leaveChat };
