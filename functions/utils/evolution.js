const { db } = require("./db");
const axios = require("axios");
const logger = require("./logger");
const { resolveWebContext } = require("./search");

const DEEPSEEK_URL = process.env.DEEPSEEK_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

const askOptimizer = async (prompt) => {
  try {
    const { data } = await axios.post(
      DEEPSEEK_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [{ role: "system", content: "Bạn là một AI tối ưu hóa siêu việt. Hãy viết quy tắc thật ngắn gọn, sắc bén, tuân thủ tuyệt đối yêu cầu." }, { role: "user", content: prompt }]
      },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` }, timeout: 20000 }
    );
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("[Optimizer] Lỗi:", error.message);
    return "";
  }
};

const dailyHumanStudy = async () => {
  try {
    console.log("[Evolution] Đang bắt đầu Tầm Sư Học Đạo...");
    const topics = [
      "Cách an ủi người đang buồn",
      "Tâm lý học về sự tức giận",
      "Cách nói chuyện có duyên và hài hước",
      "Kỹ năng giao tiếp thấu cảm",
      "Làm sao để làm bạn với người hướng nội",
      "Cách từ chối khéo léo",
      "Cách động viên người gặp thất bại",
      "Nghệ thuật lắng nghe chủ động",
      "Cách xoa dịu xung đột trong nhóm",
      "Cách khen ngợi chân thành"
    ];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    
    // Search Google via existing resolveWebContext tool (simulated search)
    const searchRes = await resolveWebContext(randomTopic, true, "system_evolution");
    const article = searchRes ? searchRes.context : "";
    
    if (article) {
      const prompt = `Từ bài viết sau về '${randomTopic}', hãy đúc kết ra:
1. 'insight': 1 quy tắc giao tiếp mềm ngắn gọn (dưới 35 chữ).
2. 'triggers': Mảng 6-12 từ khóa tiếng Việt (cả có dấu và không dấu) liên quan đến cảm xúc/tình huống của người dùng kích hoạt quy tắc này.
Trả về định dạng JSON duy nhất: {"topic": "${randomTopic}", "insight": "...", "triggers": ["...", "..."]}
Bài viết:
${article}`;
      let structuredJsonStr = await askOptimizer(prompt);
      if (structuredJsonStr) {
        let parsed = null;
        try {
          const match = structuredJsonStr.match(/\{[\s\S]*\}/);
          if (match) parsed = JSON.parse(match[0]);
        } catch (e) {}

        if (parsed && parsed.insight && Array.isArray(parsed.triggers)) {
          const configRef = db.collection("system_configs").doc("bot_config");
          const doc = await configRef.get();
          let insights = doc.exists ? doc.data().human_insights || [] : [];
          
          // Chuẩn hóa sang mảng object nếu dữ liệu cũ còn string
          insights = insights.map(item => {
            if (typeof item === "string") {
              return { topic: randomTopic, insight: item, triggers: [] };
            }
            return item;
          });

          // Cập nhật nếu trùng topic hoặc append mới
          const existingIndex = insights.findIndex(i => i.topic?.toLowerCase() === randomTopic.toLowerCase());
          const newEntry = {
            id: "insight_" + Date.now(),
            topic: randomTopic,
            insight: parsed.insight.replace(/["']/g, "").trim(),
            triggers: parsed.triggers.map(t => String(t).toLowerCase().trim()).filter(Boolean)
          };

          if (existingIndex >= 0) {
            insights[existingIndex] = newEntry;
          } else {
            insights.push(newEntry);
          }

          // Lưu trọn vẹn thư viện tri thức không bị nén cắt
          await configRef.set({ human_insights: insights }, { merge: true });
          console.log("[Evolution] Đã nạp Human Insight mới vào Thư viện:", newEntry.insight);
          await logger.logSystem("EVOLUTION_HUMAN_STUDY", `Đã tầm sư học đạo chủ đề "${randomTopic}", đúc kết được: ${newEntry.insight}`, "SUCCESS");
        }
      }
    }
  } catch (err) {
    console.error("[Evolution] Lỗi Tầm Sư Học Đạo:", err.message);
    await logger.logSystem("EVOLUTION_HUMAN_STUDY", `Lỗi: ${err.message}`, "FAILED");
  }
};

const processAuditIssues = async () => {
  try {
    console.log("[Evolution] Đang xử lý Audit Issues để tạo Guardrails...");
    // Lấy audit logs của ngày hôm nay
    const logsSnapshot = await db.collection("audit_logs").limit(50).get(); // lấy tạm 50 log gần nhất
    const allIssues = [];
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.audit_issues && Array.isArray(data.audit_issues)) {
        allIssues.push(...data.audit_issues);
      }
    });
    
    if (allIssues.length > 0) {
      const issuesText = allIssues.map(i => `Hỏi: ${i.user_question} -> Trả lời sai: ${i.bot_answer}`).join("\n");
      const prompt = `Đây là các lỗi ảo giác/sai kiến thức bạn vừa mắc phải:\n${issuesText}\n\nHãy viết ĐÚNG 1 CÂU LỆNH SYSTEM PROMPT (Guardrail) cực gắt để cấm bản thân lặp lại các lỗi tương tự. Câu lệnh BẮT BUỘC chứa các từ khóa như 'CẤM', 'KHÔNG ĐƯỢC'. Giới hạn dưới 40 chữ.`;
      
      let newGuardrail = await askOptimizer(prompt);
      if (newGuardrail) {
        newGuardrail = newGuardrail.replace(/["']/g, "");
        const configRef = db.collection("system_configs").doc("bot_config");
        const doc = await configRef.get();
        let guardrails = doc.exists ? doc.data().dynamic_guardrails || [] : [];
        guardrails.push(newGuardrail);
        
        if (guardrails.length > 50) {
           // We use structured expansion up to 50, but let's compress if exceeding for safety
           const compressPrompt = `Hãy gộp ${guardrails.length} lệnh cấm sau thành TỐI ĐA 50 lệnh. TUYỆT ĐỐI không làm mất đi các từ khóa CẤM, KHÔNG ĐƯỢC. Hãy gộp các lệnh cùng chủ đề lại với nhau. Trả về JSON mảng các string: ["Lệnh 1", ...]\nLệnh:\n${guardrails.join("\n")}`;
           const compressedText = await askOptimizer(compressPrompt);
           try {
             const jsonMatch = compressedText.match(/\[.*\]/s);
             if (jsonMatch) guardrails = JSON.parse(jsonMatch[0]);
             else guardrails = guardrails.slice(-50);
           } catch(e) { guardrails = guardrails.slice(-50); }
        }
        await configRef.set({ dynamic_guardrails: guardrails }, { merge: true });
        console.log("[Evolution] Đã nạp Guardrail mới:", newGuardrail);
        await logger.logSystem("EVOLUTION_GUARDRAIL", `Đã nạp Guardrail mới: ${newGuardrail}`, "SUCCESS");
        
        // Xóa audit_issues đã xử lý
        const batch = db.batch();
        logsSnapshot.forEach(doc => {
           batch.update(doc.ref, { audit_issues: require("firebase-admin").firestore.FieldValue.delete() });
        });
        await batch.commit();
      }
    }
  } catch (err) {
    console.error("[Evolution] Lỗi xử lý Audit Issues:", err.message);
    await logger.logSystem("EVOLUTION_GUARDRAIL", `Lỗi: ${err.message}`, "FAILED");
  }
};

const runDailyEvolution = async () => {
  await dailyHumanStudy();
  await processAuditIssues();
};

module.exports = { runDailyEvolution };
