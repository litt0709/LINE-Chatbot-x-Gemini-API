const { clearSessionHistory } = require("../utils/db");

/**
 * Xử lý lệnh quên trí nhớ (/forget)
 * Xóa toàn bộ dữ liệu của một người dùng hoặc một group dựa trên ID
 */
async function handleForgetCommand(prompt) {
  // Lệnh hỗ trợ: /forget <id>
  const match = prompt.match(/^\/forget\s+(.+)/i);
  if (!match) {
    return "❌ Bạn cần truyền vào ID của User hoặc Group. VD: `/forget U12345...`";
  }

  const targetId = match[1].trim();
  
  if (targetId.length < 5) {
    return "❌ ID không hợp lệ, vui lòng kiểm tra lại.";
  }

  try {
    await clearSessionHistory(targetId);
    return `✅ Đã xóa toàn bộ dữ liệu trí nhớ (Session, DB, Raw Messages) của ID: ${targetId}`;
  } catch (error) {
    console.error(`[Forget Command] Lỗi xóa trí nhớ cho ${targetId}:`, error);
    return `❌ Lỗi khi xóa trí nhớ: ${error.message}`;
  }
}

module.exports = {
  handleForgetCommand
};
