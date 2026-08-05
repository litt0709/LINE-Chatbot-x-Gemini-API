const { handleAsciiCommand } = require('./ascii');
const { handleReportCommand } = require('./report');
const { handleInfoCommand } = require('./info');
const { handleForgetCommand } = require('./forget');

/**
 * Command Dispatcher
 * Quét tin nhắn xem có chứa lệnh hệ thống không.
 * Nếu có, xử lý và trả về chuỗi kết quả. Nếu không, trả về null.
 * 
 * @param {string} prompt Tin nhắn của người dùng
 * @param {object} context Các thông tin ngữ cảnh { platform, userId, senderName, chatId, ... }
 * @returns {Promise<string|null>} Nội dung phản hồi của lệnh, hoặc null nếu không phải lệnh
 */
async function handleCommand(prompt, context) {
  const cleanPrompt = prompt.trim();

  // Bỏ qua nếu prompt quá dài không giống lệnh
  if (cleanPrompt.length > 100) return null;

  // 1. Lệnh vẽ ASCII ẩn (trigger khi chat "vẽ chữ xyz" hoặc "/vẽ chữ xyz")
  if (/(?:^|\s)(?:\/)?(vẽ) (chữ|tên|ascii)\s+(.+)/i.test(cleanPrompt)) {
    return handleAsciiCommand(cleanPrompt);
  }

  // 2. Lệnh báo cáo (Token / Health) - hỗ trợ cả tự nhiên
  if (/^\/health$/i.test(cleanPrompt) || 
      /(cho )?(tôi )?biết sức kho(ẻ|e)/i.test(cleanPrompt) || 
      /(báo cáo|thống kê|cho xem) (sức kho(ẻ|e)|health)/i.test(cleanPrompt)) {
    return await handleReportCommand("/health", context);
  }

  if (/(báo cáo|thống kê|cho xem|xem) (chi phí|token|deepseek|tiền)/i.test(cleanPrompt) || /^\/report$/i.test(cleanPrompt)) {
    return await handleReportCommand("/report", context);
  }

  // 3. Lệnh thông tin (Help / About)
  if (/^\/(help|about)$/i.test(cleanPrompt)) {
    return handleInfoCommand(cleanPrompt);
  }

  // 4. Lệnh Forget
  if (/^\/forget\s+.+/i.test(cleanPrompt)) {
    return handleForgetCommand(cleanPrompt);
  }

  return null;
}

module.exports = {
  handleCommand
};
