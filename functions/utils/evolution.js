const { db } = require("./db");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const logger = require("./logger");
const { DEFAULT_TAXONOMY, mergeTaxonomy } = require("./taxonomyRouter");
const { DEFAULT_SKILLS, mergeAndDedupSkill } = require("./skillLibrary");

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

const MAX_PROACTIVE_TRIGGERS = 150;
const MAX_STANDALONE_TOPICS = 200;

const escapeRegexSafe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Tự động tiến hóa cây Taxonomy 3 tầng & cấu hình từ audit_logs hàng đêm (Autonomous /update).
 * - Loại bỏ 100% tên riêng cá nhân / sự kiện nhất thời / từ đơn gây nhiễu.
 * - Khái quát hóa thành Common Concepts vào đúng nhánh Domain > SubTopic.
 * - Đồng bộ 2 chiều LINE <-> Telegram và dọn sạch audit_logs (Inbox Zero).
 */
const evolveTaxonomyFromLogs = async () => {
  try {
    const configRef = db.collection("system_configs").doc("bot_config");
    const cfgSnap = await configRef.get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};

    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = vnTime.toISOString().split("T")[0];

    if (cfg.last_taxonomy_update_date === todayStr) {
      console.log(`[Evolution] Hôm nay (${todayStr}) đã hoàn tất cập nhật Taxonomy. Bỏ qua.`);
      return;
    }

    const logsSnapshot = await db.collection("audit_logs").limit(50).get();
    if (logsSnapshot.empty) {
      console.log("[Evolution] Không có audit_logs mới để cập nhật Taxonomy.");
      return;
    }

    const rawKeywords = new Set();
    const rawTopics = new Set();
    const rawProactive = new Set();
    const rawLinkReqs = new Set();

    logsSnapshot.forEach(doc => {
      const d = doc.data();
      (d.audit_keywords || []).forEach(k => k?.word && rawKeywords.add(String(k.word).trim()));
      (d.missed_topics || []).forEach(t => t && rawTopics.add(String(t).trim()));
      (d.missed_proactive_keywords || []).forEach(p => p && rawProactive.add(String(p).trim()));
      (d.missed_link_requests || []).forEach(l => l && rawLinkReqs.add(String(l).trim()));
    });

    if (rawKeywords.size === 0 && rawTopics.size === 0 && rawProactive.size === 0 && rawLinkReqs.size === 0) {
      console.log("[Evolution] audit_logs không có keyword/topic mới.");
      return;
    }

    const currentTaxonomy = (cfg.taxonomy && Object.keys(cfg.taxonomy).length > 0) ? cfg.taxonomy : DEFAULT_TAXONOMY;
    const schemaSummary = Object.entries(currentTaxonomy)
      .map(([dom, dCfg]) => `${dom}: [${Object.keys(dCfg.subtopics || {}).join(", ")}]`)
      .join("\n");

    const prompt = `Bạn là Taxonomy Architect của chatbot Annie. Hãy lọc và khái quát hóa dữ liệu thô sau thành khái niệm phổ quát:
Cây Taxonomy hiện tại (Domain: [subtopics]):
${schemaSummary}

Dữ liệu thô từ lịch sử chat:
- Keywords: ${[...rawKeywords].slice(0, 80).join(" | ")}
- Topics: ${[...rawTopics].slice(0, 40).join(" | ")}
- Proactive cues: ${[...rawProactive].slice(0, 40).join(" | ")}
- Link requests: ${[...rawLinkReqs].slice(0, 15).join(" | ")}

QUY TẮC BẮT BUỘC:
1. TUYỆT ĐỐI LOẠI BỎ mọi tên riêng cá nhân (vd: jensen huang, shark bình, elon musk, mr pips, tên thành viên nhóm), tên sản phẩm/sự kiện nhất thời (vd: vf3, concert...), và từ đơn quá chung chung (vd: ai, us, vn, khó, buồn).
2. Chỉ giữ lại KHÁI NIỆM PHỔ QUÁT (common concepts, viết thường, 1-3 từ) thực sự giúp phân loại chủ đề vào đúng Domain > subtopic có sẵn.
3. Proactive cues: chỉ giữ cụm từ tự nhiên >= 2 từ biểu hiện cần hỗ trợ/hỏi ý kiến.
4. Trả về JSON duy nhất đúng cấu trúc:
{
  "taxonomy_additions": [{"domain":"TECH","subtopic":"ai_llm","tier":"core","concept":"..."}],
  "standalone_topics": ["..."],
  "proactive_triggers": ["..."],
  "link_requests": ["..."]
}`;

    const aiReply = await askOptimizer(prompt);
    let parsed = null;
    if (aiReply) {
      try {
        const match = aiReply.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch (e) {
        console.warn("[Evolution] Lỗi parse JSON Taxonomy:", e.message);
      }
    }

    let summaryParts = [];
    const updatePayload = { last_taxonomy_update_date: todayStr };

    if (parsed) {
      const { taxonomy: updatedTaxonomy, added: taxAdded } = mergeTaxonomy(currentTaxonomy, parsed.taxonomy_additions || [], 25);
      updatePayload.taxonomy = updatedTaxonomy;
      if (taxAdded.length > 0) summaryParts.push(`taxonomy(+${taxAdded.length})`);

      if (Array.isArray(parsed.standalone_topics) && parsed.standalone_topics.length > 0) {
        const cur = Array.isArray(cfg.standalone_topics) ? [...cfg.standalone_topics] : [];
        const set = new Set(cur.map(x => String(x).toLowerCase().trim()));
        let cnt = 0;
        for (const t of parsed.standalone_topics) {
          const clean = String(t || "").trim().toLowerCase();
          if (clean.length >= 4 && !set.has(clean) && cur.length < MAX_STANDALONE_TOPICS) {
            set.add(clean);
            cur.push(clean);
            cnt++;
          }
        }
        if (cnt > 0) {
          updatePayload.standalone_topics = cur;
          summaryParts.push(`topics(+${cnt})`);
        }
      }

      if (Array.isArray(parsed.proactive_triggers) && parsed.proactive_triggers.length > 0) {
        const cur = Array.isArray(cfg.proactive_trigger_words) ? [...cfg.proactive_trigger_words] : [];
        const set = new Set(cur.map(x => String(x).toLowerCase().trim()));
        let cnt = 0;
        for (const p of parsed.proactive_triggers) {
          const clean = String(p || "").trim().toLowerCase();
          if (clean.includes(" ") && clean.length >= 5 && !set.has(clean) && cur.length < MAX_PROACTIVE_TRIGGERS) {
            set.add(clean);
            cur.push(clean);
            cnt++;
          }
        }
        if (cnt > 0) {
          updatePayload.proactive_trigger_words = cur;
          summaryParts.push(`proactive(+${cnt})`);
        }
      }

      if (Array.isArray(parsed.link_requests) && parsed.link_requests.length > 0) {
        const existingParts = (cfg.link_requests_regex || "").split("|").map(s => s.trim()).filter(Boolean);
        const set = new Set(existingParts.map(s => s.toLowerCase()));
        let cnt = 0;
        for (const l of parsed.link_requests) {
          const clean = String(l || "").trim().toLowerCase();
          if (clean.length >= 4 && !set.has(clean)) {
            set.add(clean);
            existingParts.push(escapeRegexSafe(clean));
            cnt++;
          }
        }
        if (cnt > 0) {
          const mergedRegex = existingParts.join("|");
          try {
            new RegExp(mergedRegex, "i");
            updatePayload.link_requests_regex = mergedRegex;
            summaryParts.push(`link_req(+${cnt})`);
          } catch (e) { /* skip invalid regex */ }
        }
      }
    }

    await configRef.set(updatePayload, { merge: true });

    // Đồng bộ 2 chiều sang Companion Project (LINE <-> Telegram)
    const companion = getCompanionDb();
    if (companion) {
      try {
        await companion.collection("system_configs").doc("bot_config").set(updatePayload, { merge: true });
        console.log("[Evolution] Đã đồng bộ Taxonomy sang Companion Project!");
      } catch (syncErr) {
        console.warn("[Evolution] Lỗi đồng bộ Taxonomy sang Companion Project:", syncErr.message);
      }
    }

    // Dọn dẹp Inbox Zero trên audit_logs
    const { FieldValue } = admin.firestore;
    const batch = db.batch();
    let deletedDocs = 0;
    logsSnapshot.forEach(doc => {
      const d = doc.data();
      const hasIssues = Array.isArray(d.audit_issues) && d.audit_issues.length > 0;
      if (!hasIssues) {
        batch.delete(doc.ref);
        deletedDocs++;
      } else {
        batch.update(doc.ref, {
          audit_keywords: FieldValue.delete(),
          missed_link_requests: FieldValue.delete(),
          missed_topics: FieldValue.delete(),
          missed_entities: FieldValue.delete(),
          missed_proactive_keywords: FieldValue.delete(),
          suggested_stopwords: FieldValue.delete()
        });
      }
    });
    await batch.commit();

    const msg = summaryParts.length > 0
      ? `Tự động tiến hóa Taxonomy: ${summaryParts.join(", ")} (đã dọn ${deletedDocs} audit_logs).`
      : `Đã kiểm tra ${logsSnapshot.size} audit_logs (không phát sinh khái niệm phổ quát mới, đã dọn ${deletedDocs} docs).`;
    console.log(`[Evolution] ${msg}`);
    await logger.logSystem("EVOLUTION_TAXONOMY", msg, "SUCCESS");
  } catch (err) {
    console.error("[Evolution] Lỗi cập nhật Taxonomy tự động:", err.message);
    await logger.logSystem("EVOLUTION_TAXONOMY", `Lỗi: ${err.message}`, "FAILED");
  }
};

const MAX_CUSTOM_SKILLS = 30;

/**
 * Cơ chế Tự học & Tối ưu Custom Skills hàng ngày (tách biệt với Tầm Sư Học Đạo).
 * - Lưu tại Firestore system_configs/bot_skills (1 read / 5 phút via RAM cache).
 * - 2 lớp chống trùng lặp (LLM Semantic Dedup + Offline slug/name/trigger overlap).
 * - Đồng bộ 2 chiều LINE <-> Telegram.
 */
const dailySkillEvolution = async () => {
  try {
    const skillsRef = db.collection("system_configs").doc("bot_skills");
    const snap = await skillsRef.get();
    const docData = snap.exists ? snap.data() : {};

    const vnTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const todayStr = vnTime.toISOString().split("T")[0];

    if (docData.last_skill_study_date === todayStr) {
      console.log(`[Evolution] Hôm nay (${todayStr}) đã hoàn tất học/tối ưu Skills. Bỏ qua.`);
      return;
    }

    let skillsMap = (docData.skills && Object.keys(docData.skills).length > 0)
      ? { ...docData.skills }
      : { ...DEFAULT_SKILLS };

    const existingList = Object.values(skillsMap);
    const existingCatalog = existingList
      .map(s => `- ${s.slug} | ${s.name} (v${s.version || 1}): ${s.summary}`)
      .join("\n");

    const canAddMore = existingList.length < MAX_CUSTOM_SKILLS;
    // Chọn 1 skill có version thấp nhất để tinh chỉnh thêm nếu cần
    const lowestVerSkill = [...existingList].sort((a, b) => (a.version || 1) - (b.version || 1))[0];

    const prompt = `Bạn là Skill Architect của chatbot Annie (trợ lý thân thiện, thông minh, tinh tế cho người Việt).
Kho kỹ năng hiện tại (${existingList.length}/${MAX_CUSTOM_SKILLS}):
${existingCatalog}

NHIỆM VỤ HÔM NAY:
${canAddMore ? "1. Đề xuất ĐÚNG 1 kỹ năng MỚI có giá trị thực tiễn cao cho đời sống/công việc/học tập/giải trí (KHÔNG trùng bản chất hay mục đích với BẤT KỲ kỹ năng nào trong danh sách trên, dù đặt tên khác)." : "1. Kho đã đạt trần, KHÔNG tạo thêm kỹ năng mới (để new_skill = null)."}
2. Tinh chỉnh (refine) kỹ năng "${lowestVerSkill?.slug}" (hiện tại: "${lowestVerSkill?.prompt}") cho ngắn gọn, sắc bén, khoa học và tự nhiên hơn nếu có thể cải thiện (nếu đã tối ưu rồi thì để refined_skill = null).

QUY TẮC BẮT BUỘC:
- Prompt mỗi skill PHẢI cực kỳ ngắn gọn, mạch lạc (<= 65 từ), không dài dòng gây tốn token, đảm bảo câu trả lời tự nhiên, thân thiện, tinh tế.
- Triggers: 4-6 cụm từ khóa tiếng Việt tự nhiên (>= 2 từ, viết thường) mà người dùng hay gõ khi cần kỹ năng đó.
- category thuộc: creative | tech | finance | language | communication | thinking | productivity | lifestyle.

Trả về DUY NHẤT JSON:
{
  "new_skill": { "slug": "snake_case", "name": "...", "category": "...", "summary": "...", "triggers": ["..."], "prompt": "..." },
  "refined_skill": { "slug": "${lowestVerSkill?.slug || ""}", "name": "${lowestVerSkill?.name || ""}", "category": "${lowestVerSkill?.category || "general"}", "summary": "...", "triggers": ["..."], "prompt": "..." }
}`;

    const aiReply = await askOptimizer(prompt);
    const changes = [];

    if (aiReply) {
      try {
        const match = aiReply.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.new_skill && canAddMore) {
            const res = mergeAndDedupSkill(skillsMap, parsed.new_skill, MAX_CUSTOM_SKILLS);
            skillsMap = res.skills;
            if (res.action === "ADDED") changes.push(`Học mới skill "${parsed.new_skill.name}" (${res.slug})`);
            else if (res.action === "REFINED") changes.push(`Gộp/tối ưu skill "${res.slug}"`);
          }
          if (parsed.refined_skill && parsed.refined_skill.slug && skillsMap[parsed.refined_skill.slug]) {
            const res = mergeAndDedupSkill(skillsMap, parsed.refined_skill, MAX_CUSTOM_SKILLS);
            skillsMap = res.skills;
            if (res.action === "REFINED") changes.push(`Nâng cấp skill "${res.slug}" lên v${skillsMap[res.slug].version}`);
          }
        }
      } catch (parseErr) {
        console.warn("[Evolution] Lỗi parse JSON dailySkillEvolution:", parseErr.message);
      }
    }

    const payload = {
      skills: skillsMap,
      last_skill_study_date: todayStr,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };

    await skillsRef.set(payload, { merge: true });

    // Đồng bộ 2 chiều sang Companion Project (LINE <-> Telegram)
    const companion = getCompanionDb();
    if (companion) {
      try {
        await companion.collection("system_configs").doc("bot_skills").set(payload, { merge: true });
        console.log("[Evolution] Đã đồng bộ bot_skills sang Companion Project!");
      } catch (syncErr) {
        console.warn("[Evolution] Lỗi đồng bộ bot_skills sang Companion Project:", syncErr.message);
      }
    }

    const logMsg = changes.length > 0
      ? `Tiến hóa Custom Skills: ${changes.join("; ")} (Tổng: ${Object.keys(skillsMap).length} skills).`
      : `Đã đồng bộ kho ${Object.keys(skillsMap).length} Custom Skills.`;
    console.log(`[Evolution] ${logMsg}`);
    await logger.logSystem("EVOLUTION_SKILL", logMsg, "SUCCESS");
  } catch (err) {
    console.error("[Evolution] Lỗi dailySkillEvolution:", err.message);
    await logger.logSystem("EVOLUTION_SKILL", `Lỗi: ${err.message}`, "FAILED");
  }
};

const runDailyEvolution = async () => {
  await dailyHumanStudy();
  await dailySkillEvolution();
  await processAuditIssues();
  await evolveTaxonomyFromLogs();
};

module.exports = { runDailyEvolution };
