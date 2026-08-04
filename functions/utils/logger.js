const { rtdb } = require("./db");

/**
 * Lấy ngày tháng năm chuẩn (Asia/Ho_Chi_Minh) định dạng YYYY-MM-DD
 * @returns {string}
 */
const getFormattedDate = () => {
  const vnDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Ho_Chi_Minh" }));
  const yyyy = vnDate.getFullYear();
  const mm = String(vnDate.getMonth() + 1).padStart(2, "0");
  const dd = String(vnDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/**
 * Ghi nhận log hệ thống (Hoạt động tính năng, Cronjob)
 * @param {string} action - Tên hành động/Tính năng (VD: CRON_JOB, EVOLUTION)
 * @param {string} details - Chi tiết (VD: Đã hoàn tất vá lỗi nhận thức)
 * @param {string} status - SUCCESS | FAILED | INFO
 */
const logSystem = async (action, details, status = "INFO") => {
  try {
    const today = getFormattedDate();
    const timestamp = new Date().toISOString();
    console.log(`[SYSTEM][${status}] ${action}: ${details}`);
    
    await rtdb.ref(`logs/system_logs/${today}`).push({
      timestamp,
      action,
      details,
      status
    });
  } catch (error) {
    console.error("[Logger] Lỗi khi ghi System Log:", error.message);
  }
};

/**
 * Ghi nhận lỗi vận hành (Giao tiếp với API, user)
 * @param {string} errorType - Phân loại lỗi (VD: LLM_ERROR, SEARCH_ERROR)
 * @param {string} message - Message của lỗi (VD: Request failed with status code 400)
 * @param {Object|string} metadata - (Optional) Object response data từ axios hoặc thông tin debug
 */
const logOperational = async (errorType, message, metadata = null) => {
  try {
    const today = getFormattedDate();
    const timestamp = new Date().toISOString();
    console.error(`[OPERATIONAL][${errorType}] ${message}`, metadata || "");
    
    await rtdb.ref(`logs/operational_logs/${today}`).push({
      timestamp,
      errorType,
      message,
      metadata: metadata ? JSON.stringify(metadata).substring(0, 500) : null
    });
  } catch (error) {
    console.error("[Logger] Lỗi khi ghi Operational Log:", error.message);
  }
};

module.exports = {
  logSystem,
  logOperational,
  getFormattedDate
};
