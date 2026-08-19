const { rtdb } = require("./db");

/**
 * Lấy ngày định dạng YYYY-MM-DD dựa trên múi giờ Việt Nam, trừ đi số ngày (offset)
 * @param {number} daysOffset 
 * @returns {string}
 */
const getVNDateOffset = (daysOffset) => {
  const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000 - (daysOffset * 24 * 60 * 60 * 1000));
  return vnTime.toISOString().split("T")[0];
};

/**
 * Lấy báo cáo tự học trong khoảng thời gian nhất định
 * @param {number} days Số ngày (3 hoặc 7)
 * @returns {Promise<string|null>} Nội dung báo cáo hoặc null nếu không có
 */
const getLearningReport = async (days = 3) => {
  try {
    const targetActions = ["EVOLUTION_HUMAN_STUDY", "EVOLUTION_GUARDRAIL", "FACT_LEARNED"];
    const learningData = {
      human_study: [],
      guardrails: [],
      facts: []
    };
    
    let totalLearned = 0;

    // Quét từng ngày
    for (let i = 0; i < days; i++) {
      const dateStr = getVNDateOffset(i);
      const snap = await rtdb.ref(`logs/system_logs/${dateStr}`).once("value");
      if (snap.exists()) {
        snap.forEach(child => {
          const item = child.val();
          if (item && targetActions.includes(item.action) && item.status === "SUCCESS") {
            totalLearned++;
            if (item.action === "EVOLUTION_HUMAN_STUDY") {
              learningData.human_study.push(`- ${item.details}`);
            } else if (item.action === "EVOLUTION_GUARDRAIL") {
              learningData.guardrails.push(`- ${item.details}`);
            } else if (item.action === "FACT_LEARNED") {
              learningData.facts.push(`- ${item.details}`);
            }
          }
        });
      }
    }

    if (totalLearned === 0) {
      if (days === 3) {
        return await getLearningReport(7); // Tự nâng lên 7 ngày
      }
      return null;
    }

    // Format Báo Cáo
    let reportText = `🎓 **[Báo cáo Tự Học - ${days} ngày qua]**\n\n`;
    
    if (learningData.human_study.length > 0) {
      reportText += `🧠 **Tầm sư học đạo (Human Insights):**\n${learningData.human_study.join("\n")}\n\n`;
    }
    
    if (learningData.guardrails.length > 0) {
      reportText += `🛡️ **Tự kiểm điểm lỗi (Guardrails):**\n${learningData.guardrails.join("\n")}\n\n`;
    }
    
    if (learningData.facts.length > 0) {
      reportText += `📚 **Thu nạp kiến thức từ cộng đồng (Facts):**\n${learningData.facts.join("\n")}\n\n`;
    }

    reportText += `*"Học, học nữa, học mãi để phục vụ sếp tốt hơn!"*`;
    return reportText.trim();
    
  } catch (err) {
    console.error("[Learning] Lỗi lấy báo cáo tự học:", err.message);
    return null;
  }
};

/**
 * Kiểm tra xem người dùng có đang hỏi về việc học hỏi của bot không
 * @param {string} text Nội dung tin nhắn
 * @returns {Promise<string|null>} Nội dung báo cáo nếu khớp, ngược lại null
 */
const handleLearningRegex = async (text) => {
  if (!text) return null;
  const regex = /(mày|bạn|em|bot|annie).*(học được|tầm sư học đạo|nâng cấp trí|tự học)/i;
  if (regex.test(text) || /^\/learning/i.test(text)) {
    let report = await getLearningReport(3);
    if (!report) report = "Dạ dạo này em đang bận phục vụ mọi người nên chưa kịp học thêm gì mới ạ. Sếp dạy thêm cho em nha! 🥰";
    return report;
  }
  return null;
};

module.exports = {
  getLearningReport,
  handleLearningRegex
};
