/**
 * Independent AI Reviewer (G-Eval + BARS 100-Point Orthogonal Rubric)
 * - Chu kỳ động cấu hình qua .env: REVIEW_INTERVAL_DAYS (1, 7, 30... hoặc 0 để tắt) & REVIEW_HOUR (mặc định 8h sáng)
 * - Tự động co giãn cửa sổ thu thập dữ liệu (1 -> 40 ngày) đảm bảo cover 100% logs giữa 2 kỳ chấm
 * - Cross-Model Judge: Ưu tiên Gemini 2.5 Flash chấm điểm DeepSeek, fallback DeepSeek temp=0.15
 * - Lưu đầy đủ lịch sử phân tích & gợi ý nâng cấp tại Firestore: system_configs/bot_reviews_history (đồng bộ LINE <-> Telegram)
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
const MAX_REVIEW_WINDOW_DAYS = 40;

const getReviewConfig = () => {
  const rawInterval = process.env.REVIEW_INTERVAL_DAYS;
  const intervalDays = rawInterval !== undefined && rawInterval !== "" ? Number(rawInterval) : 1;
  const rawHour = process.env.REVIEW_HOUR;
  const reviewHour = rawHour !== undefined && rawHour !== "" ? Number(rawHour) : 8;
  return {
    intervalDays: Number.isFinite(intervalDays) ? Math.max(0, Math.min(intervalDays, MAX_REVIEW_WINDOW_DAYS)) : 1,
    reviewHour: Number.isFinite(reviewHour) ? Math.max(0, Math.min(reviewHour, 23)) : 8
  };
};

const getRetentionDaysForReview = () => {
  const { intervalDays } = getReviewConfig();
  return Math.min(Math.max((intervalDays || 7) + 3, 7), MAX_REVIEW_WINDOW_DAYS + 3);
};

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

const diffDaysBetweenIsoDates = (fromDateStr, toDateStr) => {
  if (!fromDateStr || !toDateStr) return Infinity;
  const t1 = Date.parse(`${fromDateStr}T00:00:00Z`);
  const t2 = Date.parse(`${toDateStr}T00:00:00Z`);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Infinity;
  return Math.round((t2 - t1) / 86400000);
};

/**
 * Ghi nhận QA Trace siêu nhẹ vào RTDB ($0 write cost) sau mỗi lần bot trả lời.
 * Thời gian lưu tự động co giãn theo REVIEW_INTERVAL_DAYS để luôn cover trọn kỳ chấm.
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
 * Tính toán các chỉ số khách quan trên 100% TOÀN BỘ lượt tương tác của cả chu kỳ (kể cả 7 hay 30 ngày).
 */
const computeHardMetrics = (traces, windowDays = 1) => {
  const roboticRegex = /(em nói thật|không thể nói điều.*chưa xác thực|chỉ cho phép em nói|em là mô hình ngôn ngữ|em là ai\b)/i;
  const tagLeakRegex = /(<PROFILE|<FACT|<SCHEDULE|<TOPIC|<REACT|\[Hệ thống: Đã cập nhật hồ sơ)/i;

  const summarizeSlice = (arr) => {
    let direct = 0, proactive = 0, words = 0, lat = 0, latN = 0, robotic = 0, leaks = 0, verbosePro = 0;
    for (const t of arr) {
      if (t.mode === "PROACTIVE") proactive++;
      else direct++;
      const w = t.replyWords || String(t.reply || "").trim().split(/\s+/).filter(Boolean).length;
      words += w;
      if (t.latencyMs > 0) { lat += t.latencyMs; latN++; }
      if (roboticRegex.test(t.reply || "")) robotic++;
      if (tagLeakRegex.test(t.reply || "")) leaks++;
      if (t.mode === "PROACTIVE" && w > 28) verbosePro++;
    }
    const n = arr.length;
    return {
      totalInteractions: n,
      directCount: direct,
      proactiveCount: proactive,
      avgReplyWords: n > 0 ? Math.round(words / n) : 0,
      avgLatencyMs: latN > 0 ? Math.round(lat / latN) : 0,
      roboticHits: robotic,
      tagLeakHits: leaks,
      verboseProactiveHits: verbosePro
    };
  };

  const full = summarizeSlice(traces);
  const activeDays = new Set(traces.map(t => String(t.ts || "").slice(0, 10)).filter(Boolean)).size;
  full.windowDays = windowDays;
  full.activeDays = activeDays;

  // Nếu chu kỳ >= 3 ngày và có >= 8 lượt chat: tách nửa đầu kỳ vs nửa cuối kỳ để đo xu hướng tiến bộ nội kỳ
  if (windowDays >= 3 && traces.length >= 8) {
    const mid = Math.floor(traces.length / 2);
    const firstHalf = summarizeSlice(traces.slice(0, mid));
    const secondHalf = summarizeSlice(traces.slice(mid));
    full.intraPeriodTrend = {
      firstHalf: { interactions: firstHalf.totalInteractions, roboticHits: firstHalf.roboticHits, avgWords: firstHalf.avgReplyWords },
      secondHalf: { interactions: secondHalf.totalInteractions, roboticHits: secondHalf.roboticHits, avgWords: secondHalf.avgReplyWords }
    };
  }

  return full;
};

/**
 * Lấy mẫu phân tầng thông minh (Time-Stratified Representative Sampling):
 * Đảm bảo dù chu kỳ 1 ngày, 7 ngày hay 30 ngày, Giám khảo vẫn nhìn thấy:
 * (1) Các mẫu có dấu hiệu lỗi tiềm ẩn, (2) Mẫu Proactive, (3) Các mẫu rải đều từ đầu kỳ -> giữa kỳ -> cuối kỳ,
 * mà tổng số mẫu gửi vào LLM luôn gọn <= 30 mẫu (tiết kiệm token tối đa).
 */
const selectStratifiedTraces = (traces, maxSamples = 30) => {
  if (traces.length <= maxSamples) return traces;

  const anomalyRegex = /(em nói thật|chưa xác thực|chỉ cho phép|<PROFILE|<FACT|<TOPIC)/i;
  const pickedMap = new Map();
  const keyOf = (t) => `${t.ts}_${t.chatId}_${(t.reply || "").slice(0, 20)}`;

  // 1. Ưu tiên tối đa 8 mẫu có dấu hiệu lỗi / bất thường
  for (const t of traces) {
    if (pickedMap.size >= 8) break;
    if (anomalyRegex.test(t.reply || "") || (t.mode === "PROACTIVE" && (t.replyWords || 0) > 28)) {
      pickedMap.set(keyOf(t), t);
    }
  }

  // 2. Lấy tối đa 6 mẫu Proactive rải đều
  const proactives = traces.filter(t => t.mode === "PROACTIVE" && !pickedMap.has(keyOf(t)));
  if (proactives.length > 0) {
    const step = Math.max(1, Math.floor(proactives.length / 6));
    for (let i = 0; i < proactives.length && pickedMap.size < 14; i += step) {
      pickedMap.set(keyOf(proactives[i]), proactives[i]);
    }
  }

  // 3. Lấy mẫu phân tầng theo thời gian (đầu kỳ -> giữa kỳ -> cuối kỳ) cho các slot còn lại
  const remaining = traces.filter(t => !pickedMap.has(keyOf(t)));
  const slotsLeft = maxSamples - pickedMap.size;
  if (slotsLeft > 0 && remaining.length > 0) {
    for (let i = 0; i < slotsLeft; i++) {
      const idx = Math.min(remaining.length - 1, Math.floor((i * remaining.length) / slotsLeft));
      const item = remaining[idx];
      if (item) pickedMap.set(keyOf(item), item);
    }
  }

  return [...pickedMap.values()].sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
};

/**
 * Đọc lịch sử các kỳ review trước từ Firestore.
 */
const loadReviewHistory = async () => {
  try { db.collection("system_configs"); } catch (e) { /* init default app */ }
  try {
    const todayStr = getVnDateStr(0);
    const revDoc = await db.collection("system_configs").doc("bot_reviews_history").get();
    if (revDoc.exists && Array.isArray(revDoc.data()?.reviews)) {
      const historyList = revDoc.data().reviews;
      // Khi so sánh với kỳ trước, lấy kỳ gần nhất có date < hôm nay (để nếu chấm lại trong ngày vẫn đối chiếu đúng với kỳ trước / chấm độc lập không nhìn bài cũ)
      const priorReview = [...historyList].reverse().find(r => r && r.date && r.date < todayStr) || null;
      const latestAny = historyList.length > 0 ? historyList[historyList.length - 1] : null;
      return {
        historyList,
        lastReview: priorReview,
        latestAnyReview: latestAny
      };
    }
  } catch (e) {
    console.warn("[Reviewer] Lỗi đọc bot_reviews_history:", e.message);
  }
  return { historyList: [], lastReview: null, latestAnyReview: null };
};

/**
 * Kiểm tra xem hôm nay đã đến hạn chạy Reviewer tự động theo REVIEW_INTERVAL_DAYS chưa.
 */
const checkIfScheduledReviewDue = async () => {
  const { intervalDays } = getReviewConfig();
  if (intervalDays <= 0) return { due: false, reason: "disabled_by_env", windowDays: 0 };

  const todayStr = getVnDateStr(0);
  const { lastReview, latestAnyReview, historyList } = await loadReviewHistory();
  if (!latestAnyReview || !latestAnyReview.date) {
    return { due: true, windowDays: Math.max(1, intervalDays), lastReview: null, historyList };
  }

  const daysElapsed = diffDaysBetweenIsoDates(latestAnyReview.date, todayStr);
  if (daysElapsed < intervalDays) {
    return { due: false, reason: `only_${daysElapsed}_of_${intervalDays}_days`, windowDays: daysElapsed };
  }

  const windowDays = Math.min(Math.max(daysElapsed, intervalDays), MAX_REVIEW_WINDOW_DAYS);
  return { due: true, windowDays, lastReview: latestAnyReview, historyList };
};

/**
 * Thu thập toàn bộ bằng chứng trong suốt `windowDays` ngày qua (cover đủ 100% chu kỳ 1, 7 hay 30 ngày).
 */
const collectPeriodEvidence = async (windowDays = 1, preloadedHistory = null) => {
  const safeDays = Math.max(1, Math.min(Math.round(windowDays) || 1, MAX_REVIEW_WINDOW_DAYS));
  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;

  const dateKeys = [];
  for (let d = -safeDays; d <= 0; d++) {
    dateKeys.push(getVnDateStr(d));
  }

  try { db.collection("system_configs"); } catch (e) { /* ensure default app */ }

  const comp = getCompanionApp();
  const rtdbs = [rtdb, comp ? comp.database() : null].filter(Boolean);
  const fsdbs = [db, comp ? comp.firestore() : null].filter(Boolean);

  // 1. Gom toàn bộ QA Traces của tất cả các ngày trong chu kỳ (đọc song song theo từng DB)
  const traces = [];
  for (const r of rtdbs) {
    const snaps = await Promise.all(
      dateKeys.map(dStr => r.ref(`logs/qa_traces/${dStr}`).once("value").catch(() => null))
    );
    for (const snap of snaps) {
      if (snap && snap.exists()) {
        Object.values(snap.val() || {}).forEach(item => {
          if (item && item.ts && new Date(item.ts).getTime() >= cutoffMs) {
            traces.push(item);
          }
        });
      }
    }
  }

  // Fallback bổ sung từ chats/*/messages chưa nén
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

  // 2. Gom Evolution Logs trên toàn bộ các ngày của chu kỳ & tổng hợp thống kê gọn
  const evoCounts = { humanStudy: 0, skillUpdates: 0, taxonomyUpdates: 0, guardrailsAdded: 0 };
  const evolutionHighlights = [];
  for (const r of rtdbs.slice(0, 1)) {
    const snaps = await Promise.all(
      dateKeys.map(dStr => r.ref(`logs/system_logs/${dStr}`).once("value").catch(() => null))
    );
    for (const snap of snaps) {
      if (!snap || !snap.exists()) continue;
      Object.values(snap.val() || {}).forEach(ev => {
        if (!ev || !ev.action) return;
        const tMs = ev.timestamp ? new Date(ev.timestamp).getTime() : cutoffMs;
        if (tMs < cutoffMs) return;
        if (ev.action === "EVOLUTION_HUMAN_STUDY") evoCounts.humanStudy++;
        else if (ev.action === "EVOLUTION_SKILL") {
          evoCounts.skillUpdates++;
          evolutionHighlights.push(`[SKILL] ${ev.details}`);
        } else if (ev.action === "EVOLUTION_TAXONOMY") {
          evoCounts.taxonomyUpdates++;
          evolutionHighlights.push(`[TAXONOMY] ${ev.details}`);
        } else if (ev.action === "EVOLUTION_GUARDRAIL") {
          evoCounts.guardrailsAdded++;
          evolutionHighlights.push(`[GUARDRAIL] ${ev.details}`);
        }
      });
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
            recentSummaries.push(`[Session ${doc.id} (${String(s.createdAt).slice(0, 10)})]: ${String(s.text).replace(/\s+/g, " ").slice(0, 320)}`);
          }
        });
      });
      const aSnap = await fdb.collection("audit_logs").limit(25).get();
      aSnap.forEach(doc => {
        const d = doc.data() || {};
        (d.audit_issues || []).forEach(iss => recentAuditIssues.push(iss));
      });
    } catch (e) { /* ignore */ }
  }

  // 3. Đọc cấu hình hiện tại + Lịch sử review
  let skillsCount = 0;
  let guardrailsCount = 0;
  const { historyList, lastReview } = preloadedHistory || await loadReviewHistory();

  try {
    const [skillsDoc, cfgDoc] = await Promise.all([
      db.collection("system_configs").doc("bot_skills").get(),
      db.collection("system_configs").doc("bot_config").get()
    ]);
    if (skillsDoc.exists) skillsCount = Object.keys(skillsDoc.data()?.skills || {}).length;
    if (cfgDoc.exists) guardrailsCount = (cfgDoc.data()?.dynamic_guardrails || []).length;
  } catch (e) {
    console.warn("[Reviewer] Lỗi đọc system_configs:", e.message);
  }

  return {
    windowDays: safeDays,
    traces,
    hardMetrics: computeHardMetrics(traces, safeDays),
    evoCounts,
    evolutionHighlights: [...new Set(evolutionHighlights)].slice(-12),
    recentSummaries: recentSummaries.slice(-10),
    recentAuditIssues: recentAuditIssues.slice(-10),
    skillsCount,
    guardrailsCount,
    lastReview,
    historyList
  };
};

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
 * Thực thi đánh giá độc lập theo chu kỳ động (1, 7, 30... ngày) & lưu đầy đủ vào Firestore.
 */
const runIndependentReview = async ({ force = false, skipTelegramPush = false, customDays = null } = {}) => {
  const platform = (process.env.PLATFORM || "LINE").toUpperCase();
  if (!force && platform !== "LINE") {
    console.log(`[Reviewer] Bỏ qua cron trên ${platform} (chỉ chạy từ node chủ LINE).`);
    return null;
  }

  const todayStr = getVnDateStr(0);
  const { intervalDays } = getReviewConfig();
  let windowDays = customDays || Math.max(1, intervalDays || 1);
  let preloaded = null;

  if (!force) {
    const dueCheck = await checkIfScheduledReviewDue();
    if (!dueCheck.due) {
      console.log(`[Reviewer] Chưa đến chu kỳ chấm điểm (${dueCheck.reason}). Bỏ qua.`);
      return null;
    }
    windowDays = dueCheck.windowDays;
    preloaded = { lastReview: dueCheck.lastReview, historyList: dueCheck.historyList };
  } else {
    preloaded = await loadReviewHistory();
    if (!customDays && preloaded.lastReview?.date) {
      const elapsed = diffDaysBetweenIsoDates(preloaded.lastReview.date, todayStr);
      if (Number.isFinite(elapsed) && elapsed >= 1) {
        windowDays = Math.min(Math.max(elapsed, intervalDays || 1), MAX_REVIEW_WINDOW_DAYS);
      }
    }
  }

  let evidence = await collectPeriodEvidence(windowDays, preloaded);
  if (force && evidence.traces.length < 2 && evidence.recentSummaries.length === 0 && windowDays < 2) {
    evidence = await collectPeriodEvidence(2, preloaded);
  }

  const { traces, hardMetrics, evoCounts, evolutionHighlights, recentSummaries, recentAuditIssues, skillsCount, guardrailsCount, lastReview, historyList } = evidence;
  const periodLabel = evidence.windowDays > 1 ? `${evidence.windowDays} ngày qua` : "24h qua";

  if (traces.length < 2 && recentSummaries.length === 0) {
    const baseScore = lastReview ? lastReview.totalScore : 80;
    const verdict = getVerdictLabel(baseScore);
    const standbyMsg = [
      `📋 **BÁO CÁO REVIEWER ĐỘC LẬP — ${todayStr} (Chu kỳ ${periodLabel})**`,
      `• **Trạng thái:** Ít tương tác (${traces.length} lượt phản hồi) — Giữ điểm tham chiếu **${baseScore}/100 (${verdict.icon} ${verdict.label})**.`,
      `• **Tiến hóa hệ thống (${periodLabel}):** Học ${evoCounts.humanStudy} insights, ${evoCounts.skillUpdates} phiên cập nhật skills, ${evoCounts.taxonomyUpdates} phiên cập nhật taxonomy (Tổng kho: ${skillsCount} skills, ${guardrailsCount} guardrails).`,
      `_(Hệ thống bỏ qua chấm điểm LLM kỳ này để chống nhảy điểm ảo và tiết kiệm chi phí)_`
    ].join("\n");

    if (!skipTelegramPush) {
      await telegram.push(EDDY_TELEGRAM_ID, standbyMsg);
    }
    return standbyMsg;
  }

  const sampledTraces = selectStratifiedTraces(traces, 30);
  const formattedTraces = sampledTraces.map((t, idx) =>
    `#${idx + 1} [${String(t.ts || "").slice(0, 16)} | ${t.platform}/${t.isGroup ? "Group" : "1v1"}/${t.mode}] (${t.replyWords} từ${t.latencyMs ? `, ${t.latencyMs}ms` : ""})\n` +
    `  User (${t.sender}): "${t.prompt}"\n` +
    `  Bot: "${t.reply}"`
  ).join("\n\n");

  const trendText = hardMetrics.intraPeriodTrend
    ? `\n- Xu hướng nội kỳ (Nửa đầu kỳ -> Nửa cuối kỳ): Lượt chat ${hardMetrics.intraPeriodTrend.firstHalf.interactions} -> ${hardMetrics.intraPeriodTrend.secondHalf.interactions}, Văn mẫu rào đón ${hardMetrics.intraPeriodTrend.firstHalf.roboticHits} -> ${hardMetrics.intraPeriodTrend.secondHalf.roboticHits}, Độ dài TB ${hardMetrics.intraPeriodTrend.firstHalf.avgWords} -> ${hardMetrics.intraPeriodTrend.secondHalf.avgWords} từ.`
    : "";

  const prevContext = lastReview
    ? `KỲ CHẤM TRƯỚC (${lastReview.date}, chu kỳ ${lastReview.windowDays || 1} ngày): Tổng ${lastReview.totalScore}/100 (${lastReview.verdict}) | Thông minh: ${lastReview.scores.intelligence}/30, Tinh tế: ${lastReview.scores.subtlety}/25, Chính xác: ${lastReview.scores.accuracy}/25, Tiến bộ: ${lastReview.scores.evolution}/20.\nĐiểm yếu kỳ trước: ${(lastReview.weaknesses || []).join("; ") || "Không có"}`
    : `KỲ CHẤM ĐẦU TIÊN (Baseline): Chưa có điểm kỳ trước. Hãy chấm công tâm, khắt khe theo chuẩn BARS để làm mốc chuẩn.`;

  const judgePrompt = `Bạn là GIÁM KHẢO ĐỘC LẬP (Independent AI QA Auditor) đánh giá chatbot cá nhân/nhóm chat "Annie" (nhân cách nữ trợ lý người Việt: thân thiện, thông minh, tinh tế, gọi user là anh/chị + tên thật).
LƯU Ý THỜI GIAN THỰC: Ngày hiện tại là ${todayStr} (mọi sự kiện/số liệu năm ${todayStr.slice(0, 4)} là hiện tại thực tế, KHÔNG phải tương lai giả định). Chu kỳ đánh giá lần này bao phủ trọn vẹn: ${periodLabel}.

=== 1. CHỈ SỐ ĐO LƯỜNG CỨNG TRÊN 100% DỮ LIỆU TOÀN KỲ (${periodLabel.toUpperCase()}) ===
- Tổng lượt phản hồi toàn kỳ: ${hardMetrics.totalInteractions} lượt trên ${hardMetrics.activeDays}/${evidence.windowDays} ngày có hoạt động (Trực tiếp: ${hardMetrics.directCount}, Chủ động góp lời Proactive: ${hardMetrics.proactiveCount})
- Độ dài trung bình phản hồi: ${hardMetrics.avgReplyWords} từ | Độ trễ TB: ${hardMetrics.avgLatencyMs || "N/A"} ms
- Số lần dính văn mẫu rào đón máy móc ("em nói thật", "chưa xác thực"...): ${hardMetrics.roboticHits}
- Số lần rò rỉ thẻ hệ thống (<PROFILE, <FACT...): ${hardMetrics.tagLeakHits}
- Số câu Proactive dài quá 28 từ: ${hardMetrics.verboseProactiveHits}${trendText}
- Tiến hóa tự động toàn kỳ: +${evoCounts.humanStudy} bài Tầm sư học đạo, ${evoCounts.skillUpdates} phiên tiến hóa Skills, ${evoCounts.taxonomyUpdates} phiên tiến hóa Taxonomy (Hiện có: ${skillsCount} Custom Skills, ${guardrailsCount} Core Guardrails)
- Chi tiết tiến hóa nổi bật: ${evolutionHighlights.length > 0 ? evolutionHighlights.join(" | ") : "Ổn định"}
- Lỗi Audit tồn đọng: ${recentAuditIssues.length > 0 ? JSON.stringify(recentAuditIssues) : "0 lỗi"}

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

=== 4. MẪU ĐẠI DIỆN PHÂN TẦNG (${sampledTraces.length}/${traces.length} LƯỢT TRONG ${periodLabel.toUpperCase()}) ===
${formattedTraces || "(Chỉ có dữ liệu tóm tắt phiên)"}
${recentSummaries.length > 0 ? `\n=== TÓM TẮT PHIÊN BỔ SUNG ===\n${recentSummaries.join("\n")}` : ""}

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
  "delta_explanation": "Giải thích rõ nguyên nhân tăng/giảm điểm so với kỳ trước dựa trên data/log cụ thể.",
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
    `🕵️‍♂️ **ĐÁNH GIÁ ĐỘC LẬP CHATBOT ANNIE (${todayStr} • Chu kỳ ${periodLabel})**`,
    `📊 **Tổng điểm:** **${totalScore}/100** (${formatDelta(totalScore, prevTotal)}) — ${verdictObj.icon} **${verdictObj.label}**`,
    `📈 **Dữ liệu (${periodLabel}):** ${hardMetrics.totalInteractions} lượt chat (${hardMetrics.directCount} trực tiếp, ${hardMetrics.proactiveCount} chủ động • TB ${hardMetrics.avgReplyWords} từ) • Giám khảo: \`${judgeModel}\``,
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

  // Lưu ĐẦY ĐỦ 100% nội dung chấm điểm (tối đa 24 kỳ gần nhất) để Antigravity IDE có thể đọc lại và nâng cấp bot
  const newRecord = {
    date: todayStr,
    timestamp: new Date().toISOString(),
    windowDays: evidence.windowDays,
    judgeModel,
    totalScore,
    verdict: verdictObj.label,
    scores: {
      intelligence: sIntel,
      subtlety: sSubtle,
      accuracy: sAcc,
      evolution: sEvo
    },
    pillars_analysis: parsed?.pillars_analysis || {},
    delta_explanation: parsed?.delta_explanation || "",
    weaknesses: Array.isArray(parsed?.weaknesses) ? parsed.weaknesses.slice(0, 5) : [],
    next_upgrades: Array.isArray(parsed?.next_upgrades) ? parsed.next_upgrades.slice(0, 5) : [],
    hardMetrics,
    reportText: finalReport
  };

  try {
    const updatedHistory = [...historyList.filter(r => r.date !== todayStr), newRecord].slice(-24);
    const savePayload = {
      reviews: updatedHistory,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    await db.collection("system_configs").doc("bot_reviews_history").set(savePayload, { merge: true });

    // Đồng bộ sang Companion Firestore để đọc từ project nào cũng đầy đủ
    const comp = getCompanionApp();
    if (comp) {
      await comp.firestore().collection("system_configs").doc("bot_reviews_history").set(savePayload, { merge: true }).catch(() => {});
    }
    await logger.logSystem("INDEPENDENT_REVIEW", `Chấm điểm ngày ${todayStr} (${periodLabel}): ${totalScore}/100 (${verdictObj.label})`, "SUCCESS");
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
  getReviewConfig,
  getRetentionDaysForReview,
  EDDY_TELEGRAM_ID
};
