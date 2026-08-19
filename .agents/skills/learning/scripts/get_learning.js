const path = require("path");
const admin = require(path.join(__dirname, "../../../../functions/node_modules/firebase-admin"));

const lineKey = require(path.join(__dirname, "../../../../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(lineKey),
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const rtdb = admin.database();

const getVNDateOffset = (daysOffset) => {
  const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000 - (daysOffset * 24 * 60 * 60 * 1000));
  return vnTime.toISOString().split("T")[0];
};

async function generateReport() {
  try {
    let days = 3;
    const targetActions = ["EVOLUTION_HUMAN_STUDY", "EVOLUTION_GUARDRAIL", "FACT_LEARNED"];
    const learningData = { human_study: [], guardrails: [], facts: [] };

    const scanDays = async (numDays) => {
      for (let i = 0; i < numDays; i++) {
        const dateStr = getVNDateOffset(i);
        const snap = await rtdb.ref(`logs/system_logs/${dateStr}`).once("value");
        if (snap.exists()) {
          const data = snap.val();
          Object.values(data).forEach(item => {
            if (item && targetActions.includes(item.action) && item.status === "SUCCESS") {
              if (item.action === "EVOLUTION_HUMAN_STUDY") learningData.human_study.push(`- ${item.details}`);
              else if (item.action === "EVOLUTION_GUARDRAIL") learningData.guardrails.push(`- ${item.details}`);
              else if (item.action === "FACT_LEARNED") learningData.facts.push(`- ${item.details}`);
            }
          });
        }
      }
    };

    await scanDays(3);
    const count3Days = learningData.human_study.length + learningData.guardrails.length + learningData.facts.length;

    if (count3Days === 0) {
      days = 7;
      learningData.human_study = [];
      learningData.guardrails = [];
      learningData.facts = [];
      await scanDays(7);
    }

    const totalLearned = learningData.human_study.length + learningData.guardrails.length + learningData.facts.length;

    if (totalLearned === 0) {
      console.log(JSON.stringify({ status: "success", data: "Bot dạo này đang bận phục vụ mọi người nên chưa kịp học thêm gì mới." }, null, 2));
      process.exit(0);
    }

    let reportText = `🎓 **[Báo cáo Tự Học - ${days} ngày qua]**\n\n`;
    if (learningData.human_study.length > 0) {
      reportText += `🧠 **Tầm sư học đạo (Human Insights):**\n${[...new Set(learningData.human_study)].join("\n")}\n\n`;
    }
    if (learningData.guardrails.length > 0) {
      reportText += `🛡️ **Tự kiểm điểm lỗi (Guardrails):**\n${[...new Set(learningData.guardrails)].join("\n")}\n\n`;
    }
    if (learningData.facts.length > 0) {
      reportText += `📚 **Thu nạp kiến thức từ cộng đồng (Facts):**\n${[...new Set(learningData.facts)].join("\n")}\n\n`;
    }

    console.log(JSON.stringify({ status: "success", data: reportText }, null, 2));
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

generateReport();
