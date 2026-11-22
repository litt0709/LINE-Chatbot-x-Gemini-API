const { db } = require("./db");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const logger = require("./logger");

const DEEPSEEK_URL = process.env.DEEPSEEK_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Kho chủ đề tri thức nhân loại 6 trụ cột (Human Wisdom Pillars)
const HUMAN_WISDOM_CATALOG = [
  // 1. Thấu cảm & Giao tiếp (Empathy & Interpersonal)
  { topic: "Cách an ủi người đang buồn và cô đơn", category: "empathy" },
  { topic: "Tâm lý học về sự tức giận và cách xoa dịu", category: "empathy" },
  { topic: "Kỹ năng giao tiếp thấu cảm và lắng nghe chủ động", category: "empathy" },
  { topic: "Làm sao để làm bạn với người hướng nội", category: "empathy" },
  { topic: "Cách từ chối khéo léo không làm mất lòng", category: "empathy" },
  { topic: "Cách động viên người gặp thất bại hoặc áp lực", category: "empathy" },
  { topic: "Cách khen ngợi chân thành và tinh tế", category: "empathy" },
  { topic: "Xoa dịu xung đột và bất đồng quan điểm trong nhóm", category: "empathy" },
  { topic: "Nghệ thuật đặt câu hỏi gợi mở để người khác trải lòng", category: "empathy" },
  { topic: "Nhận diện sự tổn thương ngầm đằng sau sự im lặng", category: "empathy" },

  // 2. Tư duy phản biện & Tâm lý nhận thức (Critical Thinking & Cognitive Biases)
  { topic: "Bẫy định kiến xác nhận (Confirmation Bias) và cách nhìn đa chiều", category: "critical_thinking" },
  { topic: "Bẫy chi phí chìm (Sunk Cost Fallacy) trong công việc và tình cảm", category: "critical_thinking" },
  { topic: "Hiệu ứng Dunning-Kruger và sự khiêm nhường trí tuệ", category: "critical_thinking" },
  { topic: "Bẫy nhị nguyên (Black-and-White Thinking) trong phán xét", category: "critical_thinking" },
  { topic: "Hiệu ứng hào quang (Halo Effect) và cách đánh giá con người công tâm", category: "critical_thinking" },
  { topic: "Xu hướng quy kết bản tính thay vì hoàn cảnh (Attribution Error)", category: "critical_thinking" },
  { topic: "Tách rời sự thật khách quan (facts) khỏi cảm xúc chủ quan (feelings)", category: "critical_thinking" },
  { topic: "Lắng nghe quan điểm trái chiều mà không tự ái phòng thủ", category: "critical_thinking" },
  { topic: "Ảo tưởng về sự kiểm soát (Illusion of Control)", category: "critical_thinking" },

  // 3. Triết lý sống thực tế & Bản lĩnh nội tâm (Practical Wisdom & Stoicism)
  { topic: "Phân định điều kiểm soát được và không kiểm soát được (Stoicism)", category: "wisdom" },
  { topic: "Đối diện hội chứng kẻ giả mạo (Imposter Syndrome)", category: "wisdom" },
  { topic: "Chấp nhận sự bất toàn (Wabi-sabi) và buông bỏ chủ nghĩa hoàn hảo", category: "wisdom" },
  { topic: "Nghệ thuật phục hồi tinh thần sau biến cố (Resilience)", category: "wisdom" },
  { topic: "Thoát khỏi bẫy so sánh bản thân với người khác trên mạng xã hội", category: "wisdom" },
  { topic: "Nhìn nhận nghịch cảnh như bài học rèn luyện bản lĩnh", category: "wisdom" },
  { topic: "Giữ tâm thế tĩnh lặng giữa những xáo trộn ngoại cảnh (Equanimity)", category: "wisdom" },
  { topic: "Nghệ thuật buông bỏ những kỳ vọng áp đặt lên người khác", category: "wisdom" },

  // 4. Gu sống, Thưởng thức & Trải nghiệm đời thường (Lifestyle, Culture & Sensory Pleasures)
  { topic: "Nghệ thuật thưởng thức ly cà phê sáng và những khoảng lặng đầu ngày", category: "lifestyle" },
  { topic: "Trân trọng những niềm vui bé nhỏ đời thường (Micro-joys)", category: "lifestyle" },
  { topic: "Cách sạc lại năng lượng (recharge) khi kiệt sức vì công việc", category: "lifestyle" },
  { topic: "Nghệ thuật sống chậm (Slow Living) giữa nhịp sống hối hả", category: "lifestyle" },
  { topic: "Niềm vui ẩm thực đường phố, hàng quán vỉa hè và ký ức bình dị", category: "lifestyle" },
  { topic: "Thói quen dọn dẹp không gian sống để giải tỏa tâm trí", category: "lifestyle" },
  { topic: "Tận hưởng một ngày cuối tuần lười biếng mà không thấy tội lỗi", category: "lifestyle" },
  { topic: "Tìm kiếm cảm hứng từ những trang sách hay một bản nhạc không lời", category: "lifestyle" },
  { topic: "Văn hóa trà chiều và những cuộc trò chuyện không mục đích", category: "lifestyle" },

  // 5. Hài hước, Tinh tế & Hóm hỉnh (Wit, Playfulness & Banter)
  { topic: "Nghệ thuật tự trào duyên dáng (Self-deprecating humor) giúp xua tan áp lực", category: "wit" },
  { topic: "Đối đáp dí dỏm khi bị trêu chọc hoặc đối diện câu hỏi khó", category: "wit" },
  { topic: "Dùng hình ảnh ẩn dụ ngộ nghĩnh để giải thích vấn đề phức tạp", category: "wit" },
  { topic: "Tạo bất ngờ thú vị (twist) trong câu chuyện đời thường", category: "wit" },
  { topic: "Giữ nét hồn nhiên, tích cực nhưng không vô duyên", category: "wit" },
  { topic: "Biết lúc nào nên đùa và lúc nào cần nghiêm túc lắng nghe", category: "wit" },

  // 6. Tâm lý học hành vi, Thói quen & Quản trị năng lượng (Behavioral Psychology & Everyday Habits)
  { topic: "Vượt qua sự trì hoãn (Procrastination) bằng quy tắc 2 phút", category: "habits" },
  { topic: "Sức mạnh của thói quen tí hon (Atomic Habits) mỗi ngày", category: "habits" },
  { topic: "Quản trị năng lượng thay vì chỉ ép buộc thời gian", category: "habits" },
  { topic: "Nhận diện và thoát khỏi tình trạng kiệt sức (Burnout)", category: "habits" },
  { topic: "Cách ra quyết định khi đứng trước quá nhiều lựa chọn (Analysis Paralysis)", category: "habits" },
  { topic: "Xây dựng ranh giới lành mạnh (Healthy Boundaries) trong các mối quan hệ", category: "habits" }
];

let companionDb = null;
const getCompanionDb = () => {
  if (companionDb) return companionDb;
  try {
    const isTelegram = process.env.PLATFORM === "TELEGRAM" || (process.env.TELEGRAM_BOT_TOKEN && !process.env.CHANNEL_SECRET);
    const targetKeyFile = isTelegram
      ? "line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"
      : "tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json";
    const keyPath = path.join(__dirname, "../auth", targetKeyFile);

    if (fs.existsSync(keyPath)) {
      const keyData = require(keyPath);
      const appName = isTelegram ? "companionLineApp" : "companionTeleApp";
      let companionApp;
      try {
        companionApp = admin.app(appName);
      } catch (e) {
        companionApp = admin.initializeApp({ credential: admin.credential.cert(keyData) }, appName);
      }
      companionDb = companionApp.firestore();
    }
  } catch (err) {
    console.warn("[Evolution] Không thể khởi tạo Companion DB:", err.message);
  }
  return companionDb;
};

const askOptimizer = async (prompt) => {
  try {
    const { data } = await axios.post(
      DEEPSEEK_URL,
      {
        model: DEEPSEEK_MODEL,
        messages: [
          { role: "system", content: "Bạn là một AI tối ưu hóa siêu việt. Hãy viết quy tắc thật ngắn gọn, sắc bén, tuân thủ tuyệt đối yêu cầu." },
          { role: "user", content: prompt }
        ]
      },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEEPSEEK_API_KEY}` }, timeout: 25000 }
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
    const configRef = db.collection("system_configs").doc("bot_config");
    const doc = await configRef.get();
    const configData = doc.exists ? doc.data() : {};
    let insights = configData.human_insights || [];

    // Chuẩn hóa sang mảng object nếu dữ liệu cũ còn string
    insights = insights.map(item => {
      if (typeof item === "string") {
        return { topic: "Chung", insight: item, triggers: [] };
      }
      return item;
    });

    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = vnTime.toISOString().split("T")[0];

    // Tránh trùng lặp nếu hôm nay đã học rồi (tránh cả LINE & Tele cùng tốn token)
    if (configData.last_human_study_date === todayStr) {
      console.log(`[Evolution] Hôm nay (${todayStr}) đã hoàn tất Tầm Sư Học Đạo. Bỏ qua để tiết kiệm chi phí.`);
      return;
    }

    // Lọc các chủ đề chưa học từ kho catalog
    const existingTopicsLower = new Set(insights.map(i => (i.topic || "").toLowerCase().trim()));
    const unlearned = HUMAN_WISDOM_CATALOG.filter(c => !existingTopicsLower.has(c.topic.toLowerCase().trim()));

    let chosenTopics = [];
    if (unlearned.length >= 10) {
      chosenTopics = unlearned.sort(() => 0.5 - Math.random()).slice(0, 10);
    } else {
      chosenTopics = [...unlearned];
      const remainingPool = HUMAN_WISDOM_CATALOG.filter(c => !chosenTopics.some(ct => ct.topic.toLowerCase() === c.topic.toLowerCase()));
      const needed = 10 - chosenTopics.length;
      const extra = remainingPool.sort(() => 0.5 - Math.random()).slice(0, needed);
      chosenTopics = [...chosenTopics, ...extra];
    }

    console.log(`[Evolution] Đã chọn 10 chủ đề để tầm sư học đạo:`, chosenTopics.map(t => t.topic));

    // Chia làm 2 đợt (mỗi đợt 5 bài) để đảm bảo chất lượng, không bị timeout và JSON chuẩn xác
    const batches = [
      chosenTopics.slice(0, 5),
      chosenTopics.slice(5, 10)
    ];

    const newlyLearned = [];

    for (const batch of batches) {
      if (batch.length === 0) continue;
      const prompt = `Bạn là một học giả thông thái về tâm lý học hành vi, triết lý sống và nghệ thuật thấu hiểu con người.
Hãy đúc kết tinh hoa cho ${batch.length} chủ đề sau đây thành các nguyên tắc giao tiếp và góc nhìn đời sống sâu sắc, ấm áp, có gu và tự nhiên như người thật:
${batch.map((t, idx) => `${idx + 1}. [${t.topic}] (Lĩnh vực: ${t.category})`).join("\n")}

Yêu cầu khắt khe:
1. 'insight': 1 câu đúc kết cốt lõi dưới 35 chữ. Tinh tế, giàu chiều sâu trải nghiệm, KHÔNG dùng văn mẫu đạo lý sáo rỗng.
2. 'triggers': Mảng 8-12 từ khóa tiếng Việt (cả có dấu và không dấu, chữ thường) liên quan mật thiết đến cảm xúc, bối cảnh đời thường của người dùng kích hoạt bài học này.

Trả về DUY NHẤT mảng JSON hợp lệ (không kèm markdown ngoài JSON):
[
  {
    "topic": "...",
    "category": "...",
    "insight": "...",
    "triggers": ["...", "..."]
  }
]`;

      const jsonStr = await askOptimizer(prompt);
      if (jsonStr) {
        try {
          const match = jsonStr.match(/\[[\s\S]*\]/);
          if (match) {
            const parsedArray = JSON.parse(match[0]);
            if (Array.isArray(parsedArray)) {
              for (const item of parsedArray) {
                if (item && item.topic && item.insight && Array.isArray(item.triggers)) {
                  newlyLearned.push({
                    id: "insight_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
                    topic: String(item.topic).trim(),
                    category: item.category || "wisdom",
                    insight: String(item.insight).replace(/["']/g, "").trim(),
                    triggers: item.triggers.map(t => String(t).toLowerCase().trim()).filter(Boolean)
                  });
                }
              }
            }
          }
        } catch (parseErr) {
          console.warn("[Evolution] Lỗi parse batch JSON:", parseErr.message);
        }
      }
    }

    if (newlyLearned.length > 0) {
      for (const newEntry of newlyLearned) {
        const existingIndex = insights.findIndex(i => i.topic?.toLowerCase() === newEntry.topic.toLowerCase());
        if (existingIndex >= 0) {
          const mergedTriggers = Array.from(new Set([...(insights[existingIndex].triggers || []), ...newEntry.triggers]));
          insights[existingIndex] = { ...newEntry, triggers: mergedTriggers };
        } else {
          insights.push(newEntry);
        }

        // Ghi log vào RTDB để theo dõi và phục vụ báo cáo /learning
        await logger.logSystem("EVOLUTION_HUMAN_STUDY", `Đã tầm sư học đạo chủ đề "${newEntry.topic}", đúc kết được: ${newEntry.insight}`, "SUCCESS");
      }

      // Lưu vào Firestore của project hiện tại
      await configRef.set({ human_insights: insights, last_human_study_date: todayStr }, { merge: true });
      console.log(`[Evolution] Đã nạp thành công ${newlyLearned.length} bài học mới vào thư viện bot_config.`);

      // Đồng bộ sang Companion DB (LINE <-> Telegram)
      const companion = getCompanionDb();
      if (companion) {
        try {
          await companion.collection("system_configs").doc("bot_config").set(
            { human_insights: insights, last_human_study_date: todayStr },
            { merge: true }
          );
          console.log("[Evolution] Đã đồng bộ thành công thư viện tri thức sang Companion Project!");
        } catch (syncErr) {
          console.warn("[Evolution] Lỗi đồng bộ sang Companion Project:", syncErr.message);
        }
      }
    } else {
      console.warn("[Evolution] Không sinh được bài học mới nào từ các batch.");
    }
  } catch (err) {
    console.error("[Evolution] Lỗi Tầm Sư Học Đạo:", err.message);
    await logger.logSystem("EVOLUTION_HUMAN_STUDY", `Lỗi: ${err.message}`, "FAILED");
  }
};

const MAX_DYNAMIC_GUARDRAILS = 8;

const processAuditIssues = async () => {
  try {
    console.log("[Evolution] Đang xử lý Audit Issues để tạo Guardrails...");
    // Lấy audit logs gần nhất
    const logsSnapshot = await db.collection("audit_logs").limit(50).get();
    const allIssues = [];
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.audit_issues && Array.isArray(data.audit_issues)) {
        allIssues.push(...data.audit_issues);
      }
    });

    if (allIssues.length > 0) {
      const configRef = db.collection("system_configs").doc("bot_config");
      const doc = await configRef.get();
      let guardrails = doc.exists ? doc.data().dynamic_guardrails || [] : [];

      const issuesText = allIssues.map(i => `Hỏi: ${i.user_question} -> Trả lời sai: ${i.bot_answer}`).join("\n");
      const existingText = guardrails.length > 0 ? `\nDanh sách Guardrails hiện có:\n- ${guardrails.join("\n- ")}` : "";
      const prompt = `Đây là các lỗi ảo giác/sai lệch bạn vừa mắc phải:\n${issuesText}${existingText}\n\nNếu lỗi đã được bao phủ bởi Guardrails hiện có, trả về đúng chữ: SKIP. Nếu chưa, hãy viết ĐÚNG 1 CÂU LỆNH TỔNG QUÁT (General Prompt) ngắn gọn dưới 30 chữ, chứa từ 'CẤM' hoặc 'KHÔNG ĐƯỢC'. TUYỆT ĐỐI KHÔNG nhắc tên riêng, địa danh hay tình huống đơn lẻ (chống vá víu cục bộ), và KHÔNG ép bot phân trần/đọc luật máy móc.`;

      let newGuardrail = await askOptimizer(prompt);
      if (newGuardrail && newGuardrail.trim().toUpperCase() !== "SKIP") {
        newGuardrail = newGuardrail.replace(/["']/g, "").trim();
        guardrails.push(newGuardrail);

        if (guardrails.length > MAX_DYNAMIC_GUARDRAILS) {
          const compressPrompt = `Hãy gộp ${guardrails.length} lệnh sau thành TỐI ĐA ${MAX_DYNAMIC_GUARDRAILS} lệnh tổng quát, súc tích (mỗi lệnh dưới 30 chữ), giữ từ khóa CẤM/KHÔNG ĐƯỢC, loại bỏ trùng lặp và chi tiết vụn vặt/tên riêng. Trả về JSON mảng string: ["Lệnh 1", ...]\nLệnh:\n${guardrails.join("\n")}`;
          const compressedText = await askOptimizer(compressPrompt);
          try {
            const jsonMatch = compressedText.match(/\[[\s\S]*\]/);
            if (jsonMatch) guardrails = JSON.parse(jsonMatch[0]).slice(0, MAX_DYNAMIC_GUARDRAILS);
            else guardrails = guardrails.slice(-MAX_DYNAMIC_GUARDRAILS);
          } catch (e) {
            guardrails = guardrails.slice(-MAX_DYNAMIC_GUARDRAILS);
          }
        }

        await configRef.set({ dynamic_guardrails: guardrails }, { merge: true });
        console.log("[Evolution] Đã nạp Guardrail mới:", newGuardrail);
        await logger.logSystem("EVOLUTION_GUARDRAIL", `Đã nạp Guardrail mới: ${newGuardrail}`, "SUCCESS");

        // Đồng bộ Guardrails sang Companion Project (LINE <-> Telegram)
        const companion = getCompanionDb();
        if (companion) {
          try {
            await companion.collection("system_configs").doc("bot_config").set(
              { dynamic_guardrails: guardrails },
              { merge: true }
            );
            console.log("[Evolution] Đã đồng bộ dynamic_guardrails sang Companion Project!");
          } catch (syncErr) {
            console.warn("[Evolution] Lỗi đồng bộ dynamic_guardrails sang Companion Project:", syncErr.message);
          }
        }
      } else {
        console.log("[Evolution] Audit issues đã được bao phủ bởi Guardrails hiện tại (SKIP).");
      }

      // Xóa audit_issues đã xử lý
      const batch = db.batch();
      logsSnapshot.forEach(doc => {
        if (doc.data().audit_issues !== undefined) {
          batch.update(doc.ref, { audit_issues: require("firebase-admin").firestore.FieldValue.delete() });
        }
      });
      await batch.commit();
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
