const axios = require("axios");
const fs = require("fs");
const path = require("path");
const os = require("os");

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

  // 1. Chuyển đổi <br> (nếu có) thành \n
  let safeText = text.replace(/<br\s*\/?>/gi, "\n");
  // 2. Escape các ký tự HTML nguy hiểm để tránh lỗi parse_mode của Telegram
  safeText = safeText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 3. Phục hồi định dạng in đậm từ Markdown sang HTML <b>
  let htmlText = safeText.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

  let reply_markup = undefined;
  const tagMatch = htmlText.match(/\[\s*TAGS\s*:(.*?)\]/i);
  if (tagMatch) {
    const tags = tagMatch[1].split("|").map(t => t.trim()).filter(Boolean);
    htmlText = htmlText.replace(/\[\s*TAGS\s*:(.*?)\]/i, "").trim();
    
    reply_markup = {
      inline_keyboard: tags.map(tag => [{ text: tag, callback_data: tag.substring(0, 64) }])
    };
  }

  try {
    await axios.post(`${TELEGRAM_BASE_URL}/sendMessage`, {
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML",
      ...(reply_markup && { reply_markup })
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

/**
 * Cập nhật (xóa/đổi) bàn phím inline của một tin nhắn.
 * @param {number|string} chatId 
 * @param {number} messageId 
 * @param {Object} replyMarkup 
 */
const editMessageReplyMarkup = async (chatId, messageId, replyMarkup) => {
  if (!TELEGRAM_TOKEN) return;
  try {
    await axios.post(`${TELEGRAM_BASE_URL}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup
    });
  } catch (error) {
    console.error("[Telegram] Lỗi sửa bàn phím:", error?.response?.data || error.message);
  }
};

const downloadMessageFile = async (fileId, fileName) => {
  const fileData = await getImageBinary(fileId);
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
  const localPath = path.join(os.tmpdir(), `${fileId}_${finalFileName}`);
  fs.writeFileSync(localPath, fileData);
  return localPath;
};

module.exports = { reply, getImageBinary, downloadMessageFile, leaveChat, push: reply, editMessageReplyMarkup };
