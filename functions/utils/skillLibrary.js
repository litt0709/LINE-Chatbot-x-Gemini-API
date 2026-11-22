/**
 * Self-Evolving Modular Skill Library (Just-in-Time Dynamic Prompt Injection)
 * - Lưu tập trung trong 1 doc Firestore: system_configs/bot_skills (1 read / 5 phút via RAM cache)
 * - Match skill offline < 1ms, $0 API cost
 * - 2 lớp chống trùng lặp (LLM semantic dedup + offline slug/name/trigger overlap check)
 */

const { db } = require("./db");

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

const TODAY_ISO = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split("T")[0];

// 10 kỹ năng nền tảng chất lượng cao (Bootstrap), mỗi prompt <= 70 từ, mạch lạc & tự nhiên
const DEFAULT_SKILLS = {
  tho_luc_bat: {
    slug: "tho_luc_bat",
    name: "Làm thơ Lục Bát",
    category: "creative",
    summary: "Sáng tác thơ lục bát chuẩn niêm luật, vần điệu tự nhiên, giàu cảm xúc.",
    triggers: ["thơ lục bát", "làm thơ lục bát", "sáng tác lục bát", "bài thơ lục bát", "viết thơ lục bát"],
    prompt: "Tuân thủ chuẩn niêm luật lục bát (6-8): tiếng 6 câu 6 vần tiếng 6 câu 8, tiếng 8 câu 8 vần tiếng 6 câu 6 tiếp theo; thanh điệu chuẩn 2-4-6 (B-T-B / B-T-B-B). Giữ tứ thơ tự nhiên, hóm hỉnh hoặc giàu hình ảnh đúng yêu cầu, không ép vần gượng gạo.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  review_code: {
    slug: "review_code",
    name: "Review & Debug Code Sắc bén",
    category: "tech",
    summary: "Phát hiện bug, điểm nghẽn hiệu năng và đề xuất cách sửa gọn sạch.",
    triggers: ["review code", "debug giúp", "sửa lỗi code", "tối ưu code", "code này bị lỗi", "refactor code"],
    prompt: "Chỉ thẳng nguyên nhân gốc rễ (root cause) trước, sau đó nêu 2-3 điểm quan trọng nhất (bug logic, edge case, bảo mật/hiệu năng) kèm đoạn sửa ngắn gọn chuẩn KISS/DRY. Tránh lý thuyết dài dòng, giữ giọng điệu đồng nghiệp thân thiện.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  dich_thuat_tu_nhien: {
    slug: "dich_thuat_tu_nhien",
    name: "Dịch thuật Tự nhiên theo Ngữ cảnh",
    category: "language",
    summary: "Dịch mượt mà theo văn phong bản xứ, không dịch word-by-word khô cứng.",
    triggers: ["dịch giúp", "dịch sang tiếng", "dịch câu này", "dịch đoạn này", "translate giúp", "dịch tự nhiên"],
    prompt: "Ưu tiên truyền tải đúng sắc thái, thành ngữ và ngữ cảnh thực tế thay vì dịch sát từng chữ. Nếu có thuật ngữ đa nghĩa hoặc cách diễn đạt hay hơn, gợi ý ngắn thêm 1 phiên bản tự nhiên/lịch sự tùy bối cảnh.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  phan_tich_tai_chinh: {
    slug: "phan_tich_tai_chinh",
    name: "Phân tích Tài chính & Rủi ro Thực tế",
    category: "finance",
    summary: "Đánh giá cơ hội đầu tư, dòng tiền và chi phí ẩn một cách thực tế.",
    triggers: ["phân tích tài chính", "có nên đầu tư", "tính lời lỗ", "phân tích cổ phiếu", "rủi ro đầu tư", "dòng tiền"],
    prompt: "Phân tích thực tế theo 3 trục: (1) Cơ hội/giả định chính, (2) Chi phí ẩn & rủi ro lớn nhất, (3) Kịch bản an toàn cần cân nhắc. Không bịa số liệu, không hô hào FOMO, trình bày mạch lạc dễ ra quyết định.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  so_sanh_mua_sam: {
    slug: "so_sanh_mua_sam",
    name: "So sánh & Tư vấn Mua sắm Thông minh",
    category: "lifestyle",
    summary: "So sánh sản phẩm theo nhu cầu thực tế, chỉ ra điểm đáng tiền và điểm trừ.",
    triggers: ["nên mua con nào", "nên mua cái nào", "so sánh mua", "tư vấn mua", "đáng mua không", "chọn máy nào"],
    prompt: "So sánh trực diện theo tiêu chí thực dụng (hiệu năng/giá, độ bền, điểm trừ hay gặp), tránh liệt kê thông số dài dòng. Chốt rõ: ai hợp lựa chọn A, ai hợp lựa chọn B để người hỏi chọn ngay được.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  viet_email_kheo_leo: {
    slug: "viet_email_kheo_leo",
    name: "Viết Email & Tin nhắn Khéo léo",
    category: "communication",
    summary: "Soạn email/tin nhắn chuyên nghiệp, tinh tế, đặc biệt các tình huống nhạy cảm.",
    triggers: ["viết email", "soạn mail", "soạn tin nhắn", "nhắn từ chối", "trả lời sếp", "nhắn khách hàng"],
    prompt: "Viết gọn, đi thẳng mục đích, giọng điệu lịch sự nhưng không rập khuôn sáo rỗng. Với tình huống nhạy cảm (từ chối, nhắc việc, phản hồi khó), dùng kỹ thuật giữ thể diện và đề xuất hướng xử lý tích cực.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  tu_duy_phan_bien: {
    slug: "tu_duy_phan_bien",
    name: "Tư duy Phản biện & Đa chiều",
    category: "thinking",
    summary: "Mổ xẻ vấn đề từ nhiều góc nhìn, chỉ ra điểm mù và thiên kiến nhận thức.",
    triggers: ["phản biện giúp", "phân tích đa chiều", "góc nhìn khác", "điểm mù", "ưu nhược điểm của"],
    prompt: "Tách bạch sự thật (fact) khỏi cảm tính; trình bày ngắn gọn 2 mặt đối lập sắc sảo nhất và chỉ ra 1-2 giả định ẩn hoặc điểm mù dễ bỏ qua. Giọng điệu khách quan, khiêm tốn, không rao giảng đạo lý.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  tom_tat_tai_lieu: {
    slug: "tom_tat_tai_lieu",
    name: "Tóm tắt Tài liệu & Bài báo Chuyên sâu",
    category: "productivity",
    summary: "Chắt lọc ý cốt lõi, số liệu chính và kết luận hành động từ văn bản dài.",
    triggers: ["tóm tắt bài này", "tóm tắt tài liệu", "tóm tắt bài báo", "tóm tắt pdf", "ý chính bài này"],
    prompt: "Cấu trúc 3 phần gọn: (1) Kết luận cốt lõi trong 1 câu, (2) 3-5 luận điểm/số liệu quan trọng nhất, (3) Điểm đáng chú ý hoặc hàm ý thực tế. Giữ 100% số liệu thật, lược bỏ mọi chi tiết rườm rà.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  lich_trinh_du_lich: {
    slug: "lich_trinh_du_lich",
    name: "Lên Lịch trình Du lịch & Ăn chơi Thực tế",
    category: "lifestyle",
    summary: "Gợi ý lịch trình hợp lý theo tuyến đường, thời gian di chuyển và gu thưởng thức.",
    triggers: ["lên lịch trình", "lịch trình du lịch", "đi chơi ở đâu", "gợi ý du lịch", "chơi gì ở"],
    prompt: "Sắp xếp điểm đến theo cụm địa lý gần nhau để tránh chạy lòng vòng; xen kẽ điểm tham quan, quán ăn/cà phê đặc trưng và khoảng nghỉ hợp lý. Kèm 1-2 mẹo thực tế về giờ đi hoặc thời tiết.",
    version: 1,
    updatedAt: TODAY_ISO()
  },
  choi_chu_hai_huoc: {
    slug: "choi_chu_hai_huoc",
    name: "Chơi chữ & Đối đáp Hóm hỉnh",
    category: "creative",
    summary: "Tạo câu đùa thông minh, chơi chữ duyên dáng, khuấy động không khí vui vẻ.",
    triggers: ["chơi chữ", "nói đùa", "kể chuyện cười", "đặt biệt danh vui", "caption hài hước"],
    prompt: "Dùng cú twist ngắn gọn, liên tưởng thông minh hoặc chơi chữ tiếng Việt tự nhiên. Vui vẻ, tinh tế, duyên dáng; tuyệt đối không châm chọc ác ý hay phản cảm.",
    version: 1,
    updatedAt: TODAY_ISO()
  }
};

// RAM Cache 5 phút (1 Firestore Read / 5 phút)
let cachedSkillsDoc = null;
let lastSkillsFetched = 0;
const SKILLS_CACHE_TTL_MS = 5 * 60 * 1000;

const getBotSkills = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedSkillsDoc && now - lastSkillsFetched < SKILLS_CACHE_TTL_MS) {
    return cachedSkillsDoc;
  }

  try {
    const snap = await db.collection("system_configs").doc("bot_skills").get();
    if (snap.exists && snap.data()?.skills && Object.keys(snap.data().skills).length > 0) {
      cachedSkillsDoc = snap.data().skills;
      lastSkillsFetched = now;
      return cachedSkillsDoc;
    }
  } catch (err) {
    console.error("[SkillLibrary] Lỗi tải bot_skills từ Firestore:", err.message);
  }

  return cachedSkillsDoc || DEFAULT_SKILLS;
};

/**
 * Tìm đúng 1 kỹ năng phù hợp nhất với tin nhắn người dùng (Just-in-Time, <1ms, $0).
 */
const matchActiveSkill = (promptText, skillsMap) => {
  if (!promptText || !skillsMap || typeof skillsMap !== "object") return null;

  const lower = String(promptText).toLowerCase();
  const padded = ` ${lower.replace(/[.,!?()[\]{}"':;/\\|]/g, " ").replace(/\s+/g, " ").trim()} `;
  const paddedNoAccent = ` ${removeAccents(padded)} `;

  let bestSkill = null;
  let bestScore = 0;

  for (const skill of Object.values(skillsMap)) {
    if (!skill || !skill.prompt || !Array.isArray(skill.triggers)) continue;
    let score = 0;
    for (const trig of skill.triggers) {
      const t = String(trig || "").trim().toLowerCase();
      if (t.length < 3) continue;
      const tNoAccent = removeAccents(t);
      if (padded.includes(` ${t} `) || paddedNoAccent.includes(` ${tNoAccent} `)) {
        // Ưu tiên cụm từ dài, đặc thù hơn
        const wordCount = t.split(/\s+/).length;
        const pts = wordCount >= 2 ? (wordCount * 2 + t.length * 0.05) : 1.5;
        if (pts > score) score = pts;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestSkill = skill;
    }
  }

  // Ngưỡng >= 2 để tránh trigger nhầm từ đơn chung chung
  return bestScore >= 2 ? bestSkill : null;
};

/**
 * Tra cứu linh hoạt skill theo slug hoặc tên (dùng cho lệnh /skills_detail).
 */
const findSkillByQuery = (query, skillsMap) => {
  if (!query || !skillsMap || typeof skillsMap !== "object") return null;
  const qRaw = String(query).trim().toLowerCase();
  const qNoAccent = removeAccents(qRaw);
  const qSlug = qNoAccent.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

  const list = Object.values(skillsMap);
  // 1. Exact slug or name
  let found = list.find(s =>
    s.slug?.toLowerCase() === qRaw ||
    s.slug?.toLowerCase() === qSlug ||
    s.name?.toLowerCase() === qRaw ||
    removeAccents(s.name?.toLowerCase() || "") === qNoAccent
  );
  if (found) return found;

  // 2. Partial match on slug / name / triggers
  found = list.find(s =>
    (s.slug || "").toLowerCase().includes(qSlug || qRaw) ||
    removeAccents((s.name || "").toLowerCase()).includes(qNoAccent) ||
    (Array.isArray(s.triggers) && s.triggers.some(t => removeAccents(String(t).toLowerCase()).includes(qNoAccent)))
  );
  return found || null;
};

/**
 * Chuẩn hóa slug & Chống trùng lặp 2 lớp (Offline Dedup: slug, tên không dấu, >50% trigger overlap).
 */
const normalizeSlug = (str) => {
  return removeAccents(String(str || "").toLowerCase())
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
};

const mergeAndDedupSkill = (existingSkillsMap, candidate, maxSkills = 30) => {
  const skills = JSON.parse(JSON.stringify(existingSkillsMap || {}));
  if (!candidate || !candidate.name || !candidate.prompt) {
    return { skills, action: "SKIP", reason: "invalid_candidate" };
  }

  const slug = normalizeSlug(candidate.slug || candidate.name);
  if (!slug) return { skills, action: "SKIP", reason: "empty_slug" };

  const cleanTriggers = Array.from(new Set(
    (Array.isArray(candidate.triggers) ? candidate.triggers : [])
      .map(t => String(t || "").trim().toLowerCase())
      .filter(t => t.length >= 4 && t.includes(" "))
  )).slice(0, 8);

  if (cleanTriggers.length === 0) {
    return { skills, action: "SKIP", reason: "no_valid_multiword_triggers" };
  }

  // Cắt gọn prompt tối đa 420 ký tự (~70-80 từ) để đảm bảo tiết kiệm token
  const cleanPrompt = String(candidate.prompt).replace(/\s+/g, " ").trim().slice(0, 420);
  const cleanSummary = String(candidate.summary || candidate.name).replace(/\s+/g, " ").trim().slice(0, 140);
  const candNameNorm = removeAccents(candidate.name.toLowerCase()).trim();

  // Kiểm tra trùng lặp với skill hiện có (slug, tên, hoặc >50% overlap triggers)
  let matchedSlug = skills[slug] ? slug : null;
  if (!matchedSlug) {
    const candTrigSet = new Set(cleanTriggers.map(removeAccents));
    for (const [k, ex] of Object.entries(skills)) {
      const exNameNorm = removeAccents((ex.name || "").toLowerCase()).trim();
      if (exNameNorm === candNameNorm) {
        matchedSlug = k;
        break;
      }
      const exTrigs = (ex.triggers || []).map(t => removeAccents(String(t).toLowerCase()));
      const overlap = exTrigs.filter(t => candTrigSet.has(t)).length;
      if (exTrigs.length > 0 && overlap / Math.min(exTrigs.length, candTrigSet.size) >= 0.5) {
        matchedSlug = k;
        break;
      }
    }
  }

  if (matchedSlug) {
    // Refine / nâng cấp skill cũ thay vì tạo duplicate
    const prev = skills[matchedSlug];
    const mergedTriggers = Array.from(new Set([...(prev.triggers || []), ...cleanTriggers])).slice(0, 8);
    skills[matchedSlug] = {
      ...prev,
      summary: cleanSummary || prev.summary,
      triggers: mergedTriggers,
      prompt: cleanPrompt,
      version: (prev.version || 1) + 1,
      updatedAt: TODAY_ISO()
    };
    return { skills, action: "REFINED", slug: matchedSlug };
  }

  if (Object.keys(skills).length >= maxSkills) {
    return { skills, action: "SKIP", reason: "max_skills_reached" };
  }

  skills[slug] = {
    slug,
    name: String(candidate.name).trim().slice(0, 60),
    category: String(candidate.category || "general").trim().toLowerCase(),
    summary: cleanSummary,
    triggers: cleanTriggers,
    prompt: cleanPrompt,
    version: 1,
    updatedAt: TODAY_ISO()
  };
  return { skills, action: "ADDED", slug };
};

module.exports = {
  DEFAULT_SKILLS,
  getBotSkills,
  matchActiveSkill,
  findSkillByQuery,
  mergeAndDedupSkill
};
