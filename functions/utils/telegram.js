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

  // --- Bóc tách XML Tags TRƯỚC KHI xử lý ký tự HTML ---
  let reply_markup = undefined;
  let rawText = text;

  const taskMatch = rawText.match(/<Task\s+mode="ASK"\s+tags="([^"]+)"\s*\/?>/i);
  if (taskMatch) {
    const tags = taskMatch[1].split("|").map(t => t.trim()).filter(Boolean);
    rawText = rawText.replace(/<Task[^>]*>/gi, "").trim();
    
    reply_markup = {
      inline_keyboard: tags.map(tag => {
        let safeTag = tag;
        // Rút gọn dần chuỗi tag cho đến khi toàn bộ cục JSON nhỏ hơn hoặc bằng 64 bytes
        while (Buffer.byteLength(JSON.stringify({ ts: Date.now(), t: safeTag })) > 64 && safeTag.length > 0) {
          safeTag = safeTag.slice(0, -1);
        }
        const payload = JSON.stringify({ ts: Date.now(), t: safeTag });
        return [{ text: tag, callback_data: payload }];
      })
    };
  }

  // Luôn dọn dẹp sạch sẽ mọi thẻ <Task> còn sót lại (kể cả tag lỗi cấu trúc không khớp regex)
  rawText = rawText.replace(/<Task[^>]*>/gi, "").replace(/<\/Task>/gi, "").trim();

  // 1. Chuyển đổi <br> (nếu có) thành \n
  let safeText = rawText.replace(/<br\s*\/?>/gi, "\n");
  // 2. Escape các ký tự HTML nguy hiểm để tránh lỗi parse_mode của Telegram
  safeText = safeText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  
  // Phục hồi lại thẻ <a> (ví dụ mention user) bị escape
  safeText = safeText.replace(/&lt;a href="([^"]+)"&gt;(.*?)&lt;\/a&gt;/gi, '<a href="$1">$2</a>');
  
  // 3. Băm nhỏ tin nhắn (Message Chunking) nếu quá 2000 ký tự
  // Thuật toán: Thay thế ** thành <b></b> sẽ làm chuỗi dài ra (tối đa x1.75 lần). 
  // Nên chọn MAX_LEN = 2000 để đảm bảo 2000 * 1.75 = 3500 (luôn < 4096 ký tự an toàn của Telegram).
  const MAX_LEN = 2000;
  const chunks = [];
  let currentChunk = "";

  const lines = safeText.split("\n");
  for (const line of lines) {
    if ((currentChunk.length + line.length + 1) <= MAX_LEN) {
      currentChunk += (currentChunk ? "\n" : "") + line;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      // Nếu 1 dòng đơn lẻ dài hơn MAX_LEN, buộc phải cắt cứng
      let remaining = line;
      while (remaining.length > MAX_LEN) {
        chunks.push(remaining.substring(0, MAX_LEN));
        remaining = remaining.substring(MAX_LEN);
      }
      currentChunk = remaining;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  // 4. Gửi tuần tự từng Chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    // Phục hồi định dạng in đậm từ Markdown sang HTML <b> TRÊN TỪNG CHUNK
    // Việc này đảm bảo không có thẻ <b> bị cắt đôi gây lỗi HTML parser
    let htmlText = chunk.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    
    // Chỉ đính kèm bàn phím inline ở chunk CUỐI CÙNG
    const isLast = (i === chunks.length - 1);
    
    try {
      await axios.post(`${TELEGRAM_BASE_URL}/sendMessage`, {
        chat_id: chatId,
        text: htmlText,
        parse_mode: "HTML",
        ...(isLast && reply_markup && { reply_markup })
      });
    } catch (error) {
      console.error("[Telegram] Lỗi gửi tin nhắn chunk:", error?.response?.data || error.message);
    }
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

/**
 * Gửi reaction cho tin nhắn.
 * @param {number|string} chatId 
 * @param {number} messageId 
 * @param {string} emoji 
 */
const setMessageReaction = async (chatId, messageId, emoji) => {
  if (!TELEGRAM_TOKEN || !emoji) return;
  try {
    await axios.post(`${TELEGRAM_BASE_URL}/setMessageReaction`, {
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: "emoji", emoji }]
    });
  } catch (error) {
    console.error("[Telegram] Lỗi gửi reaction:", error?.response?.data || error.message);
  }
};

/**
 * Gửi tin nhắn kèm bàn phím inline tùy chỉnh.
 * @param {number|string} chatId 
 * @param {string} text 
 * @param {Object} replyMarkup 
 */
const sendInlineMarkup = async (chatId, text, replyMarkup) => {
  if (!TELEGRAM_TOKEN) return;
  try {
    let safeText = text.replace(/<br\s*\/?>/gi, "\n");
    let htmlText = safeText.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    
    await axios.post(`${TELEGRAM_BASE_URL}/sendMessage`, {
      chat_id: chatId,
      text: htmlText,
      parse_mode: "HTML",
      reply_markup: replyMarkup
    });
  } catch (error) {
    console.error("[Telegram] Lỗi gửi sendInlineMarkup:", error?.response?.data || error.message);
  }
};

/**
 * Cập nhật nội dung văn bản của một tin nhắn cũ.
 * @param {number|string} chatId 
 * @param {number} messageId 
 * @param {string} text 
 */
const editMessageText = async (chatId, messageId, text) => {
  if (!TELEGRAM_TOKEN) return;
  try {
    let safeText = text.replace(/<br\s*\/?>/gi, "\n");
    let htmlText = safeText.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
    
    await axios.post(`${TELEGRAM_BASE_URL}/editMessageText`, {
      chat_id: chatId,
      message_id: messageId,
      text: htmlText,
      parse_mode: "HTML"
    });
  } catch (error) {
    console.error("[Telegram] Lỗi sửa tin nhắn văn bản:", error?.response?.data || error.message);
  }
};

module.exports = { reply, getImageBinary, downloadMessageFile, leaveChat, push: reply, editMessageReplyMarkup, setMessageReaction, sendInlineMarkup, editMessageText };


