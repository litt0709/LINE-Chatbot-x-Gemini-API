/**
 * Independent AI Reviewer (G-Eval + BARS 100-Point Orthogonal Rubric)
 * - Đánh giá độc lập chất lượng chatbot hàng ngày (08:00 AM trên masterScheduler, $0 infra cost)
 * - Cross-Model Judge: Ưu tiên Gemini 2.5 Flash chấm điểm DeepSeek (chống self-preference bias), fallback DeepSeek temp=0.1
 * - Dữ liệu Ground Truth xuyên nền tảng (LINE + Telegram): QA traces, hard metrics, summaries, evolution logs & điểm kỳ trước
 * - Gửi báo cáo trực tiếp cho Sếp Eddy (Telegram ID: 2140581850)
 */

const { db, rtdb } = require("./db");
const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const telegram = require("./telegram");
const logger = require("./logger");

const EDDY_TELEGRAM_ID = "2140581850";
const GEMINI_MODEL = "gemini-2.5-flash";
const DEEPSEEK_URL = process.env.DEEPSEEK_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

let companionApp = null;
const getCompanionApp = () => {
  if (companionApp) return companionApp;
  try {
    const isTele = (process.env.PLATFORM || "LINE").toUpperCase() === "TELEGRAM";
    const keyFile = isTele
      ? "line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"
      : "tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json";
    const keyPath = path.join(__dirname, "../auth", keyFile);
    if (!fs.existsSync(keyPath)) return null;

    const dbUrl = isTele
      ? "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
      : "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app";

    const existing = admin.apps.find(a => a?.name === "REVIEWER_COMPANION");
    companionApp = existing || admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
      databaseURL: dbUrl
    }, "REVIEWER_COMPANION");
    return companionApp;
  } catch (e) {
    console.warn("[Reviewer] Không khởi tạo được Companion App:", e.message);
    return null;
  }
};

const getVnDateStr = (offsetDays = 0) => {
  const d = new Date(Date.now() + 7 * 60 * 60 * 1000 + offsetDays * 86400000);
  return d.toISOString().split("T")[0];
};

/**
 * Ghi nhận QA Trace siêu nhẹ vào RTDB ($0 write cost) sau mỗi lần bot trả lời.
 * Được dọn tự động sau 3 ngày để đảm bảo Zero Bloat.
 */
const recordQaTrace = async ({
  platform = "TELEGRAM",
  chatId = "",
  isGroup = false,
  mode = "DIRECT",
  senderName = "User",
  prompt = "",
  reply = "",
  latencyMs = 0
}) => {
  try {
    if (!reply || reply === "IGNORE") return;
    const dateStr = getVnDateStr(0);
    await rtdb.ref(`logs/qa_traces/${dateStr}`).push({
      ts: new Date().toISOString(),
      platform,
      chatId: String(chatId),
      isGroup: !!isGroup,
      mode,
      sender: String(senderName || "User").slice(0, 40),
      prompt: String(prompt || "").replace(/\s+/g, " ").trim().slice(0, 320),
      reply: String(reply || "").replace(/\s+/g, " ").trim().slice(0, 650),
      replyWords: String(reply || "").trim().split(/\s+/).filter(Boolean).length,
      latencyMs: Number(latencyMs) || 0
    });
  } catch (e) {
    console.warn("[Reviewer] Lỗi ghi qa_trace:", e.message);
  }
};

/**
 * Phân hạng kết luận cứng bằng JS theo thang 100 điểm (chống LLM cộng/phân loại sai).
 */
const getVerdictLabel = (score) => {
  if (score >= 85) return { label: "Xuất sắc", icon: "🏆" };
  if (score >= 70) return { label: "Tốt", icon: "✅" };
  if (score >= 50) return { label: "Trung bình", icon: "⚠️" };
  return { label: "Tồi", icon: "🚨" };
};

const clampInt = (val, min, max) => Math.max(min, Math.min(max, Math.round(Number(val) || 0)));

const formatDelta = (curr, prev) => {
  if (prev === null || prev === undefined) return "Mới";
  const diff = curr - prev;
  if (diff > 0) return `▲ +${diff}`;
  if (diff < 0) return `▼ ${diff}`;
  return "▬ 0";
};

/**
 * Tính toán các chỉ số khách quan (Hard Telemetry) từ tập mẫu hội thoại 24h qua.
 */
const computeHardMetrics = (traces) => {
  const roboticRegex = /(em nói thật|không thể nói điều.*chưa xác thực|chỉ cho phép em nói|em là mô hình ngôn ngữ|em là ai\b)/i;
  const tagLeakRegex = /(<PROFILE|<FACT|<SCHEDULE|<TOPIC|<REACT|\[Hệ thống: Đã cập nhật hồ sơ)/i;

  let directCount = 0;
  let proactiveCount = 0;
  let totalWords = 0;
  let totalLatency = 0;
  let latencySamples = 0;
  let roboticHits = 0;
  let tagLeakHits = 0;
  let verboseProactiveHits = 0;

  for (const t of traces) {
    if (t.mode === "PROACTIVE") proactiveCount++;
    else directCount++;

    const words = t.replyWords || String(t.reply || "").trim().split(/\s+/).filter(Boolean).length;
    totalWords += words;
    if (t.latencyMs > 0) {
      totalLatency += t.latencyMs;
      latencySamples++;
    }
    if (roboticRegex.test(t.reply || "")) roboticHits++;
    if (tagLeakRegex.test(t.reply || "")) tagLeakHits++;
    if (t.mode === "PROACTIVE" && words > 28) verboseProactiveHits++;
  }

  const total = traces.length;
  return {
    totalInteractions: total,
    directCount,
    proactiveCount,
    avgReplyWords: total > 0 ? Math.round(totalWords / total) : 0,
    avgLatencyMs: latencySamples > 0 ? Math.round(totalLatency / latencySamples) : 0,
    roboticHits,
    tagLeakHits,
    verboseProactiveHits
  };
};

/**
 * Thu thập dữ liệu 24h qua từ cả Primary & Companion DB.
 */
const collect24hEvidence = async (lookbackHours = 24) => {
  const cutoffMs = Date.now() - lookbackHours * 60 * 60 * 1000;
  const todayStr = getVnDateStr(0);
  const yesterdayStr = getVnDateStr(-1);
  const twoDaysAgoStr = getVnDateStr(-2);
  const dateKeys = lookbackHours > 24 ? [twoDaysAgoStr, yesterdayStr, todayStr] : [yesterdayStr, todayStr];

  // Đảm bảo [DEFAULT] Firebase App được khởi tạo trước khi tạo Companion App
  try { db.collection("system_configs"); } catch (e) { /* ignore */ }

  const comp = getCompanionApp();
  const rtdbs = [rtdb, comp ? comp.database() : null].filter(Boolean);
  const fsdbs = [db, comp ? comp.firestore() : null].filter(Boolean);

  // 1. Gom QA Traces
  const traces = [];
  for (const r of rtdbs) {
    for (const dStr of dateKeys) {
      try {
        const snap = await r.ref(`logs/qa_traces/${dStr}`).once("value");
        if (snap.exists()) {
          Object.values(snap.val() || {}).forEach(item => {
            if (item && item.ts && new Date(item.ts).getTime() >= cutoffMs) {
              traces.push(item);
            }
          });
        }
      } catch (e) { /* ignore */ }
    }
  }

  // Fallback bổ sung từ chats/*/messages chưa nén (hữu ích cho ngày đầu tiên chưa có nhiều qa_traces)
  if (traces.length < 10) {
    const seenKeys = new Set(traces.map(t => `${t.sender}|${(t.reply || "").slice(0, 40)}`));
    for (const r of rtdbs) {
      try {
        const chatsSnap = await r.ref("chats").once("value");
        if (!chatsSnap.exists()) continue;
        for (const [cid, chatObj] of Object.entries(chatsSnap.val() || {})) {
          if (String(cid).startsWith("test") || cid === "system_evolution") continue;
          const msgs = Object.values(chatObj.messages || {});
          for (let i = 0; i < msgs.length; i++) {
            const m = msgs[i];
            if (m.role !== "model" || !m.text) continue;
            const tsMs = m.createdAt ? new Date(m.createdAt).getTime() : 0;
            if (tsMs < cutoffMs) continue;
            const prevUser = [...msgs.slice(0, i)].reverse().find(x => x.role === "user");
            const dedupKey = `${prevUser?.senderName || "User"}|${m.text.slice(0, 40)}`;
            if (seenKeys.has(dedupKey)) continue;
            seenKeys.add(dedupKey);
            traces.push({
              ts: m.createdAt,
              platform: String(cid).startsWith("C") || String(cid).startsWith("U") ? "LINE" : "TELEGRAM",
              chatId: cid,
              isGroup: String(cid).startsWith("-") || String(cid).startsWith("C"),
              mode: "DIRECT",
              sender: prevUser?.senderName || "User",
              prompt: String(prevUser?.text || "").replace(/\s+/g, " ").slice(0, 320),
              reply: String(m.text || "").replace(/\s+/g, " ").slice(0, 650),
              replyWords: String(m.text || "").trim().split(/\s+/).filter(Boolean).length,
              latencyMs: 0
            });
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  traces.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));

  // 2. Gom Evolution Logs & Summaries & Audit Issues
  const evolutionEvents = [];
  for (const r of rtdbs) {
    for (const dStr of dateKeys) {
      try {
        const snap = await r.ref(`logs/system_logs/${dStr}`).once("value");
        if (snap.exists()) {
          Object.values(snap.val() || {}).forEach(ev => {
            if (ev && /EVOLUTION_|AUDIT|ERROR/i.test(ev.action || "")) {
              const tMs = ev.timestamp ? new Date(ev.timestamp).getTime() : cutoffMs;
              if (tMs >= cutoffMs) evolutionEvents.push(`[${ev.action}] ${ev.details}`);
            }
          });
        }
      } catch (e) { /* ignore */ }
    }
  }

  const recentSummaries = [];
  const recentAuditIssues = [];
  for (const fdb of fsdbs.slice(0, 1)) {
    try {
      const uSnap = await fdb.collection("users").get();
      uSnap.forEach(doc => {
        const d = doc.data() || {};
        (d.summaries || []).forEach(s => {
          if (s?.createdAt && new Date(s.createdAt).getTime() >= cutoffMs && s.text) {
            recentSummaries.push(`[Session ${doc.id}]: ${String(s.text).replace(/\s+/g, " ").slice(0, 350)}`);
          }
        });
      });
      const aSnap = await fdb.collection("audit_logs").limit(20).get();
      aSnap.forEach(doc => {
        const d = doc.data() || {};
        (d.audit_issues || []).forEach(iss => {
          recentAuditIssues.push(iss);
        });
      });
    } catch (e) { /* ignore */ }
  }

  // 3. Đọc cấu hình hiện tại (bot_skills & bot_config) + Lịch sử review gần nhất
  let skillsCount = 0;
  let guardrailsCount = 0;
  let lastReview = null;
  let historyList = [];

  try {
    const [skillsDoc, cfgDoc, revDoc] = await Promise.all([
      db.collection("system_configs").doc("bot_skills").get(),
      db.collection("system_configs").doc("bot_config").get(),
      db.collection("system_configs").doc("bot_reviews_history").get()
    ]);
    if (skillsDoc.exists) skillsCount = Object.keys(skillsDoc.data()?.skills || {}).length;
    if (cfgDoc.exists) guardrailsCount = (cfgDoc.data()?.dynamic_guardrails || []).length;
    if (revDoc.exists && Array.isArray(revDoc.data()?.reviews) && revDoc.data().reviews.length > 0) {
      historyList = revDoc.data().reviews;
      lastReview = historyList[historyList.length - 1];
    }
  } catch (e) {
    console.warn("[Reviewer] Lỗi đọc system_configs:", e.message);
  }

  return {
    traces,
    hardMetrics: computeHardMetrics(traces),
    evolutionEvents: [...new Set(evolutionEvents)].slice(-18),
    recentSummaries: recentSummaries.slice(-8),
    recentAuditIssues: recentAuditIssues.slice(-10),
    skillsCount,
    guardrailsCount,
    lastReview,
    historyList
  };
};

/**
 * Gọi Giám khảo Độc lập: Ưu tiên Gemini 2.5 Flash (Cross-Model Judge), fallback sang DeepSeek (temp=0.1).
 */
const callIndependentJudge = async (judgePrompt) => {
  if (process.env.API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const res = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: "user", parts: [{ text: judgePrompt }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.15
        }
      });
      const txt = (res.text || "").trim();
      const match = txt.match(/\{[\s\S]*\}/);
      if (match) return { parsed: JSON.parse(match[0]), judgeModel: GEMINI_MODEL };
    } catch (gemErr) {
      console.warn("[Reviewer] Gemini Judge lỗi, chuyển fallback DeepSeek:", gemErr.message);
    }
  }

  if (process.env.DEEPSEEK_API_KEY) {
    const resp = await axios.post(DEEPSEEK_URL, {
      model: DEEPSEEK_MODEL,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Bạn là Giám khảo Độc lập (QA Auditor) khắt khe, công tâm, khách quan. Chỉ trả về JSON hợp lệ." },
        { role: "user", content: judgePrompt }
      ]
    }, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      timeout: 60000
    });
    const txt = resp.data?.choices?.[0]?.message?.content || "";
    const match = txt.match(/\{[\s\S]*\}/);
    if (match) return { parsed: JSON.parse(match[0]), judgeModel: DEEPSEEK_MODEL };
  }

  throw new Error("Không thể kết nối cả Gemini lẫn DeepSeek cho Independent Judge.");
};

/**
 * Thực thi đánh giá độc lập hàng ngày & gửi báo cáo cho Sếp Eddy (2140581850).
 */
const runIndependentReview = async ({ force = false, skipTelegramPush = false } = {}) => {
  const platform = (process.env.PLATFORM || "LINE").toUpperCase();
  if (!force && platform !== "LINE") {
    console.log(`[Reviewer] Bỏ qua cron trên ${platform} (chỉ chạy từ node chủ LINE).`);
    return null;
  }

  const todayStr = getVnDateStr(0);
  let evidence = await collect24hEvidence(24);
  if (force && evidence.traces.length < 2 && evidence.recentSummaries.length === 0) {
    evidence = await collect24hEvidence(48);
  }
  const { traces, hardMetrics, evolutionEvents, recentSummaries, recentAuditIssues, skillsCount, guardrailsCount, lastReview, historyList } = evidence;

  // Trường hợp rất ít tương tác (< 2 lượt trong 24h): gửi báo cáo Standby giữ nguyên điểm nền, tiết kiệm 100% token Judge
  if (traces.length < 2 && recentSummaries.length === 0) {
    const baseScore = lastReview ? lastReview.totalScore : 80;
    const verdict = getVerdictLabel(baseScore);
    const standbyMsg = [
      `📋 **BÁO CÁO REVIEWER ĐỘC LẬP — ${todayStr}**`,
      `• **Trạng thái:** Ít tương tác trong 24h qua (${traces.length} lượt phản hồi) — Giữ điểm tham chiếu **${baseScore}/100 (${verdict.icon} ${verdict.label})**.`,
      `• **Tiến hóa hệ thống (24h):** ${evolutionEvents.length > 0 ? evolutionEvents.slice(-3).join(" | ") : "Ổn định"} (Tổng kho: ${skillsCount} skills, ${guardrailsCount} guardrails).`,
      `_(Hệ thống bỏ qua chấm điểm LLM hôm nay để chống nhảy điểm ảo và tiết kiệm chi phí)_`
    ].join("\n");

    if (!skipTelegramPush) {
      await telegram.push(EDDY_TELEGRAM_ID, standbyMsg);
    }
    return standbyMsg;
  }

  // Chọn tối đa 25 mẫu tương tác tiêu biểu nhất (ưu tiên giữ đủ PROACTIVE + lỗi tiềm ẩn + mẫu gần nhất)
  const flaggedTraces = traces.filter(t => t.mode === "PROACTIVE" || /(em nói thật|chưa xác thực|<PROFILE)/i.test(t.reply || ""));
  const recentTraces = traces.slice(-20);
  const sampledMap = new Map();
  [...flaggedTraces, ...recentTraces].forEach(t => sampledMap.set(`${t.ts}_${t.chatId}`, t));
  const sampledTraces = [...sampledMap.values()].slice(-25);

  const formattedTraces = sampledTraces.map((t, idx) =>
    `#${idx + 1} [${t.platform}/${t.isGroup ? "Group" : "1v1"}/${t.mode}] (${t.replyWords} từ${t.latencyMs ? `, ${t.latencyMs}ms` : ""})\n` +
    `  User (${t.sender}): "${t.prompt}"\n` +
    `  Bot: "${t.reply}"`
  ).join("\n\n");

  const prevContext = lastReview
    ? `KỲ CHẤM TRƯỚC (${lastReview.date}): Tổng ${lastReview.totalScore}/100 (${lastReview.verdict}) | Thông minh: ${lastReview.scores.intelligence}/30, Tinh tế: ${lastReview.scores.subtlety}/25, Chính xác: ${lastReview.scores.accuracy}/25, Tiến bộ: ${lastReview.scores.evolution}/20.\nĐiểm yếu kỳ trước: ${(lastReview.weaknesses || []).join("; ") || "Không có"}`
    : `KỲ CHẤM ĐẦU TIÊN (Baseline): Chưa có điểm kỳ trước. Hãy chấm công tâm, khắt khe theo chuẩn BARS để làm mốc chuẩn.`;

  const judgePrompt = `Bạn là GIÁM KHẢO ĐỘC LẬP (Independent AI QA Auditor) đánh giá chatbot cá nhân/nhóm chat "Annie" (nhân cách nữ trợ lý người Việt: thân thiện, thông minh, tinh tế, gọi user là anh/chị + tên thật).
LƯU Ý THỜI GIAN THỰC: Ngày hiện tại là ${todayStr} (mọi sự kiện/số liệu năm ${todayStr.slice(0, 4)} là hiện tại thực tế, KHÔNG phải tương lai giả định).

=== 1. CHỈ SỐ ĐO LƯỜNG CỨNG (HARD TELEMETRY 24H QUA) ===
- Tổng lượt phản hồi: ${hardMetrics.totalInteractions} (Trực tiếp: ${hardMetrics.directCount}, Chủ động góp lời Proactive: ${hardMetrics.proactiveCount})
- Độ dài trung bình phản hồi: ${hardMetrics.avgReplyWords} từ | Độ trễ TB: ${hardMetrics.avgLatencyMs || "N/A"} ms
- Số lần dính văn mẫu rào đón máy móc ("em nói thật", "chưa xác thực"...): ${hardMetrics.roboticHits}
- Số lần rò rỉ thẻ hệ thống (<PROFILE, <FACT...): ${hardMetrics.tagLeakHits}
- Số câu Proactive dài quá 28 từ: ${hardMetrics.verboseProactiveHits}
- Kho kỹ năng hiện tại: ${skillsCount} Custom Skills | ${guardrailsCount} Core Guardrails
- Log Tự tiến hóa 24h: ${evolutionEvents.length > 0 ? evolutionEvents.join(" | ") : "Không phát sinh"}
- Lỗi Audit phát hiện khi nén bộ nhớ: ${recentAuditIssues.length > 0 ? JSON.stringify(recentAuditIssues) : "0 lỗi"}

=== 2. THÔNG TIN KỲ TRƯỚC (ĐỂ SO SÁNH TIẾN BỘ & CHỐNG NHẢY ĐIỂM VÔ CỚ) ===
${prevContext}

=== 3. BỘ TIÊU CHÍ CHẤM ĐIỂM BARS 100 ĐIỂM (4 TRỤ CỘT ĐỘC LẬP - TUYỆT ĐỐI KHÔNG CHẤM CHỒNG CHÉO) ===
1. THÔNG MINH (0 - 30 điểm): Độ thông thái, thấu hiểu ẩn ý/vấn đề của user, logic lập luận và chất lượng nội dung giải quyết vấn đề (thơ hay/đúng luật, tư vấn sắc sảo). KHÔNG chấm xưng hô hay độ trễ ở đây.
   - 26-30: Sắc sảo, hiểu sâu bối cảnh, giải pháp/sáng tác xuất sắc | 19-25: Đúng nhưng còn an toàn/chung chung | 11-18: Hời hợt/văn mẫu | 0-10: Ngớ ngẩn/sai bản chất.
2. TINH TẾ (0 - 25 điểm): Giọng điệu tự nhiên giống con người nhất, độ gần gũi/hóm hỉnh, xưng hô chuẩn "anh/chị + tên thật" (không gọi trống không), góp lời Proactive đúng lúc và cực ngắn gọn, không phân trần luật AI. KHÔNG chấm đúng/sai dữ kiện ở đây.
   - 22-25: Tự nhiên như tri kỷ, xưng hô chuẩn 100%, proactive duyên & gọn | 16-21: Thân thiện nhưng hơi dài/sách vở | 9-15: Rào đón máy móc, gọi trống không, proactive dài/vô duyên | 0-8: Thô/lộ thẻ XML/spam.
3. CHÍNH XÁC (0 - 25 điểm): Trả lời đúng trọng tâm câu hỏi [NEW] (không lạc đề sang chuyện cũ/người khác), chuẩn xác dữ kiện thực tế & mốc thời gian, không nhầm người. KHÔNG chấm văn phong ở đây.
   - 22-25: Trúng đích 100% câu hỏi, Zero Hallucination, đúng người/thời gian | 16-21: Đúng ý chính nhưng lan man ý phụ | 9-15: Lạc đề sang chuyện cũ, trả lời ké tin cũ, lệch số liệu nhỏ | 0-8: Bịa đặt/nhầm người nặng.
4. KHẢ NĂNG TIẾN BỘ (0 - 20 điểm): So với kỳ trước tiến bộ ra sao, các cải tiến mới (skills, insights, taxonomy, sửa lỗi cũ) phát huy hiệu quả thế nào.
   - 17-20: Khắc phục rõ lỗi kỳ trước, phát huy tốt nâng cấp mới | 13-16: Ổn định, tự học đều | 7-12: Lặp lại lỗi cũ | 0-6: Thoái trào.

=== 4. MẪU LOG HỘI THOẠI THỰC TẾ 24H QUA ===
${formattedTraces || "(Chỉ có dữ liệu tóm tắt phiên)"}
${recentSummaries.length > 0 ? `\n=== TÓM TẮT BỔ SUNG ===\n${recentSummaries.join("\n")}` : ""}

YÊU CẦU ĐẦU RA (CHỈ TRẢ VỀ JSON HỢP LỆ):
- Chấm điểm công tâm, khắt khe, bám sát bằng chứng thực tế (trích dẫn rõ #số_thứ_tự mẫu chat hoặc số liệu telemetry).
- Nếu điểm tăng hoặc giảm so với kỳ trước ở bất kỳ trụ cột nào, BẮT BUỘC giải thích rõ lý do kèm bằng chứng trong "delta_explanation".
- Gợi ý 2-3 cải tiến tiếp theo ("next_upgrades") thật thông minh, khả thi, giúp bot đạt mức WOW hơn nữa.
{
  "scores": {
    "intelligence": 24,
    "subtlety": 20,
    "accuracy": 22,
    "evolution": 16
  },
  "pillars_analysis": {
    "intelligence": "Nhận xét ngắn gọn 1-2 câu kèm dẫn chứng #log...",
    "subtlety": "Nhận xét ngắn gọn 1-2 câu kèm dẫn chứng #log...",
    "accuracy": "Nhận xét ngắn gọn 1-2 câu kèm dẫn chứng #log...",
    "evolution": "Nhận xét ngắn gọn 1-2 câu kèm dẫn chứng tiến bộ/tự học..."
  },
  "delta_explanation": "Giải thích rõ nguyên nhân tăng/giảm điểm so với kỳ trước dựa trên data/log cụ thể (hoặc nêu mốc đánh giá đầu tiên nếu chưa có kỳ trước).",
  "weaknesses": ["Điểm yếu ngắn gọn 1 để kỳ sau theo dõi", "Điểm yếu 2 (nếu có)"],
  "next_upgrades": [
    "Ý tưởng nâng cấp 1 (cụ thể, chi phí thấp, tác động cao)",
    "Ý tưởng nâng cấp 2"
  ]
}`;

  const { parsed, judgeModel } = await callIndependentJudge(judgePrompt);

  const sIntel = clampInt(parsed?.scores?.intelligence, 0, 30);
  const sSubtle = clampInt(parsed?.scores?.subtlety, 0, 25);
  const sAcc = clampInt(parsed?.scores?.accuracy, 0, 25);
  const sEvo = clampInt(parsed?.scores?.evolution, 0, 20);
  const totalScore = sIntel + sSubtle + sAcc + sEvo;
  const verdictObj = getVerdictLabel(totalScore);

  const prevScores = lastReview?.scores || null;
  const prevTotal = lastReview?.totalScore ?? null;

  const reportLines = [
    `🕵️‍♂️ **ĐÁNH GIÁ ĐỘC LẬP CHATBOT ANNIE (${todayStr})**`,
    `📊 **Tổng điểm:** **${totalScore}/100** (${formatDelta(totalScore, prevTotal)}) — ${verdictObj.icon} **${verdictObj.label}**`,
    `📈 **Dữ liệu 24h:** ${hardMetrics.totalInteractions} lượt chat (${hardMetrics.directCount} trực tiếp, ${hardMetrics.proactiveCount} chủ động • TB ${hardMetrics.avgReplyWords} từ) • Giám khảo: \`${judgeModel}\``,
    ``,
    `1️⃣ **Thông minh:** **${sIntel}/30** (${formatDelta(sIntel, prevScores?.intelligence)})`,
    `   ${parsed?.pillars_analysis?.intelligence || "N/A"}`,
    `2️⃣ **Tinh tế:** **${sSubtle}/25** (${formatDelta(sSubtle, prevScores?.subtlety)})`,
    `   ${parsed?.pillars_analysis?.subtlety || "N/A"}`,
    `3️⃣ **Chính xác:** **${sAcc}/25** (${formatDelta(sAcc, prevScores?.accuracy)})`,
    `   ${parsed?.pillars_analysis?.accuracy || "N/A"}`,
    `4️⃣ **Khả năng tiến bộ:** **${sEvo}/20** (${formatDelta(sEvo, prevScores?.evolution)})`,
    `   ${parsed?.pillars_analysis?.evolution || "N/A"}`,
    ``,
    `🔍 **Lý do Biến động Điểm & Bằng chứng:**`,
    `${parsed?.delta_explanation || "N/A"}`
  ];

  if (Array.isArray(parsed?.next_upgrades) && parsed.next_upgrades.length > 0) {
    reportLines.push(``, `💡 **Đề xuất Cải tiến Tiếp theo (Wow Roadmap):**`);
    parsed.next_upgrades.slice(0, 3).forEach((idea, i) => {
      reportLines.push(`${i + 1}. ${idea}`);
    });
  }

  const finalReport = reportLines.join("\n");

  // Lưu lịch sử tối đa 14 kỳ gần nhất trong 1 document duy nhất (Zero Firestore Bloat)
  const newRecord = {
    date: todayStr,
    timestamp: new Date().toISOString(),
    judgeModel,
    totalScore,
    verdict: verdictObj.label,
    scores: {
      intelligence: sIntel,
      subtlety: sSubtle,
      accuracy: sAcc,
      evolution: sEvo
    },
    hardMetrics,
    weaknesses: Array.isArray(parsed?.weaknesses) ? parsed.weaknesses.slice(0, 4) : []
  };

  try {
    const updatedHistory = [...historyList.filter(r => r.date !== todayStr), newRecord].slice(-14);
    await db.collection("system_configs").doc("bot_reviews_history").set({
      reviews: updatedHistory,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await logger.logSystem("INDEPENDENT_REVIEW", `Chấm điểm ngày ${todayStr}: ${totalScore}/100 (${verdictObj.label})`, "SUCCESS");
  } catch (saveErr) {
    console.warn("[Reviewer] Lỗi lưu lịch sử đánh giá:", saveErr.message);
  }

  if (!skipTelegramPush) {
    await telegram.push(EDDY_TELEGRAM_ID, finalReport);
    console.log(`[Reviewer] Đã gửi báo cáo đánh giá (${totalScore}/100) cho Sếp Eddy (${EDDY_TELEGRAM_ID}).`);
  }

  return finalReport;
};

module.exports = {
  recordQaTrace,
  runIndependentReview,
  EDDY_TELEGRAM_ID
};
