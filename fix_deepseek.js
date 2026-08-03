const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

// Remove the garbage block completely using index
const startStr = '  // Chỉ đọc Firestore summaries khi sếp hỏi tóm tắt có chỉ định thời gian';
const endStr = '    let contextualSearchPrompt = searchPrompt;';

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx > -1 && endIdx > -1) {
    const newBlock = `  let coreMemoryText = "";
  try {
    const sessionRef = db.collection("users").doc(sessionId);
    const sessionDoc = await sessionRef.get();
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data() || {};
      
      // Inject Core_Memory if exists
      if (sessionData.Core_Memory) {
        coreMemoryText = "\\n[TÓM TẮT CỐT LÕI (CORE MEMORY)]:\\n" + sessionData.Core_Memory + "\\n";
      }

      // Chỉ đọc Firestore summaries (mảng cũ) khi sếp hỏi tóm tắt có chỉ định thời gian
      if (isTimeRangeSummaryRequest(prompt)) {
        const summariesArray = sessionData.summaries || [];
        const filteredSummaries = filterSummariesByIntent(summariesArray, prompt);
        if (filteredSummaries.length > 0) {
          history.push({
            role: "model",
            text: "[TÓM TẮT LỊCH SỬ CŨ TỪ HỆ THỐNG]:\\n" + filteredSummaries.join("\\n\\n") + "\\n[HẾT TÓM TẮT]"
          });
          console.log(\`[DeepSeek] Đã bơm \${filteredSummaries.length} summaries vào prompt.\`);
        }
      }
    }
  } catch (e) {
    console.error("[DeepSeek] Lỗi đọc Firestore data:", e.message);
  }

  // ─── Phát hiện "đổi chủ đề đột ngột" (Topic Switch Detection) ─────────────
  let isStandaloneTopic = false;
  if (botConfig.standalone_topics && botConfig.standalone_topics.length > 0) {
    isStandaloneTopic = botConfig.standalone_topics.some(t => new RegExp(t, "i").test(prompt));
  }

`;
    content = content.slice(0, startIdx) + newBlock + content.slice(endIdx);
    fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
    console.log("Fixed deepseek.js");
} else {
    console.log("Failed to find boundaries", startIdx, endIdx);
}
