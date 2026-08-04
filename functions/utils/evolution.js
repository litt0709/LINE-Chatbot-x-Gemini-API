const { db } = require("./db");
const axios = require("axios");
const { DEEPSEEK_API_KEY, DEEPSEEK_URL, DEEPSEEK_MODEL } = require("../config");
const { resolveWebContext } = require("./deepseek");
const logger = require("./logger");

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
    const topics = ["Cách an ủi người đang buồn", "Tâm lý học về sự tức giận", "Cách nói chuyện có duyên và hài hước", "Kỹ năng giao tiếp thấu cảm", "Làm sao để làm bạn với người hướng nội", "Cách từ chối khéo léo"];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    
    // Search Google via existing resolveWebContext tool (simulated search)
    const searchRes = await resolveWebContext(randomTopic, true, "system_evolution");
    const article = searchRes ? searchRes.context : "";
    
    if (article) {
      const prompt = `Từ bài viết sau về '${randomTopic}', hãy đúc kết ra ĐÚNG 1 QUY TẮC MỀM (Human Insight) ngắn gọn nhất (dưới 30 chữ) để áp dụng vào giao tiếp.\nBài viết:\n${article}`;
      let newInsight = await askOptimizer(prompt);
      if (newInsight) {
        newInsight = newInsight.replace(/["']/g, ""); // Remove quotes
        
        // Push to config
        const configRef = db.collection("system_configs").doc("bot_config");
        const doc = await configRef.get();
        let insights = doc.exists ? doc.data().human_insights || [] : [];
        insights.push(newInsight);
        
        if (insights.length > 5) {
          const compressPrompt = `Hãy gộp ${insights.length} triết lý giao tiếp sau thành TỐI ĐA 5 triết lý sâu sắc và bao quát nhất. Trả về định dạng JSON mảng các string: ["Triết lý 1", "Triết lý 2", ...]\nTriết lý:\n${insights.join("\n")}`;
          const compressedText = await askOptimizer(compressPrompt);
          try {
             const jsonMatch = compressedText.match(/\[.*\]/s);
             if (jsonMatch) {
               insights = JSON.parse(jsonMatch[0]);
             } else {
               insights = insights.slice(-5); // fallback
             }
          } catch(e) { insights = insights.slice(-5); }
        }
        await configRef.set({ human_insights: insights }, { merge: true });
        console.log("[Evolution] Đã nạp Human Insight:", newInsight);
        logger.logSystem("EVOLUTION_HUMAN_STUDY", `Đã nạp Human Insight: ${newInsight}`, "SUCCESS");
      }
    }
  } catch (err) {
    console.error("[Evolution] Lỗi Tầm Sư Học Đạo:", err.message);
    logger.logSystem("EVOLUTION_HUMAN_STUDY", `Lỗi: ${err.message}`, "FAILED");
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
        logger.logSystem("EVOLUTION_GUARDRAIL", `Đã nạp Guardrail mới: ${newGuardrail}`, "SUCCESS");
        
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
    logger.logSystem("EVOLUTION_GUARDRAIL", `Lỗi: ${err.message}`, "FAILED");
  }
};

const runDailyEvolution = async () => {
  await dailyHumanStudy();
  await processAuditIssues();
};

module.exports = { runDailyEvolution };
