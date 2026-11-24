const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "READ_REVIEWS_APP");

(async () => {
  const limit = Number(process.argv[2]) || 5;
  const snap = await appLine.firestore().collection("system_configs").doc("bot_reviews_history").get();
  if (!snap.exists || !Array.isArray(snap.data()?.reviews) || snap.data().reviews.length === 0) {
    console.log("Chưa có dữ liệu chấm điểm nào trong system_configs/bot_reviews_history.");
    process.exit(0);
  }

  const reviews = snap.data().reviews;
  console.log(`=== LỊCH SỬ CHẤM ĐIỂM CHATBOT ANNIE (Tổng lưu: ${reviews.length}, hiển thị ${Math.min(limit, reviews.length)} kỳ gần nhất) ===\n`);

  reviews.slice(-limit).forEach((r, idx) => {
    console.log(`------------------------------------------------------------`);
    console.log(`#${idx + 1} Ngày: ${r.date} | Chu kỳ: ${r.windowDays || 1} ngày | Giám khảo: ${r.judgeModel}`);
    console.log(`Tổng điểm: ${r.totalScore}/100 (${r.verdict}) | Thông minh: ${r.scores?.intelligence}/30 | Tinh tế: ${r.scores?.subtlety}/25 | Chính xác: ${r.scores?.accuracy}/25 | Tiến bộ: ${r.scores?.evolution}/20`);
    console.log(`Telemetry:`, JSON.stringify(r.hardMetrics || {}));
    if (r.pillars_analysis) {
      console.log(`Phân tích chi tiết:`, JSON.stringify(r.pillars_analysis, null, 2));
    }
    if (r.delta_explanation) {
      console.log(`Biến động điểm: ${r.delta_explanation}`);
    }
    if (Array.isArray(r.weaknesses) && r.weaknesses.length > 0) {
      console.log(`Điểm yếu cần khắc phục:\n  - ${r.weaknesses.join("\n  - ")}`);
    }
    if (Array.isArray(r.next_upgrades) && r.next_upgrades.length > 0) {
      console.log(`Đề xuất nâng cấp tiếp theo:\n  - ${r.next_upgrades.join("\n  - ")}`);
    }
    console.log();
  });

  process.exit(0);
})().catch(err => {
  console.error("Lỗi đọc bot_reviews_history:", err);
  process.exit(1);
});
