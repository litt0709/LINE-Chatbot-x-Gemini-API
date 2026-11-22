/**
 * Hierarchical Semantic Taxonomy Router (3-Layer Zero-Cost Classifier)
 * Layer 1: Macro Domain (TECH, ECONOMY, SOCIETY_VN, WORLD_GEO, SOCIAL_TREND, LIFESTYLE)
 * Layer 2: Sub-topic (ai_llm, software_dev, security, markets, law_policy, ...)
 * Layer 3: Weighted Common Concepts (core = 3, context = 1) — NO proper nouns / ephemeral names
 */

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

const DEFAULT_TAXONOMY = {
  TECH: {
    route: "EXA",
    tavilyTopic: "general",
    subtopics: {
      ai_llm: {
        core: [
          "llm", "ai agent", "agentic", "prompt", "chatgpt", "deep learning", "machine learning",
          "rag", "embedding", "fine-tune", "voice clone", "agent orchestration", "tool call",
          "local llm", "cloud llm", "bong bóng ai", "ảo giác ai", "trí tuệ nhân tạo"
        ],
        context: ["model", "token", "gpu", "vram", "cuda", "inference", "benchmark", "chatbot"]
      },
      software_dev: {
        core: [
          "lập trình", "source code", "api", "sdk", "framework", "database", "docker", "kubernetes",
          "serverless", "microservice", "git", "ci/cd", "backend", "frontend", "fullstack",
          "devops", "cloud", "app script", "webhook", "headless", "dịch ngược", "kiến trúc phần mềm"
        ],
        context: ["code", "bug", "deploy", "server", "debug", "refactor", "saas", "paas", "ide", "plugin"]
      },
      security: {
        core: [
          "zero-day", "cve", "bảo mật", "an ninh mạng", "mã độc", "ransomware", "phishing",
          "tấn công mạng", "lỗ hổng", "bị hack", "rò rỉ dữ liệu", "data security", "ddos"
        ],
        context: ["hacker", "firewall", "mã hóa", "xác thực", "token leak", "chiếm quyền"]
      },
      hardware: {
        core: [
          "phần cứng", "chip bán dẫn", "card đồ họa", "vga", "unified ram", "robot hình người",
          "điện thoại", "laptop", "sạc dự phòng", "camera an ninh", "rfid", "iot"
        ],
        context: ["chip", "cpu", "ram", "ssd", "pin", "màn hình", "cảm biến", "thiết bị"]
      }
    }
  },
  ECONOMY: {
    route: "TAVILY",
    tavilyTopic: "news",
    subtopics: {
      markets: {
        core: [
          "chứng khoán", "cổ phiếu", "giá vàng", "tỷ giá", "lãi suất", "lạm phát", "thiểu phát",
          "crypto", "tiền số", "tiền điện tử", "bitcoin", "trái phiếu", "bất động sản", "vốn hóa",
          "chỉ số tiêu dùng", "gdp", "ngân hàng trung ương", "fed", "yên nhật", "đô la"
        ],
        context: ["đầu tư", "đầu cơ", "fomo", "thanh khoản", "thị trường", "tăng giá", "giảm giá", "vàng sjc", "sổ đỏ"]
      },
      business: {
        core: [
          "sáp nhập", "tái cơ cấu", "phá sản", "sa thải", "layoff", "cut cost", "esop", "ipo",
          "doanh thu", "lợi nhuận", "từ chức", "bổ nhiệm", "thuế doanh nghiệp", "hộ kinh doanh",
          "quỹ đầu tư", "rửa tiền", "tín dụng đen", "cho vay đáo hạn"
        ],
        context: ["công ty", "tập đoàn", "startup", "ceo", "cổ đông", "thương mại", "xuất khẩu", "nhập khẩu"]
      }
    }
  },
  SOCIETY_VN: {
    route: "TAVILY",
    tavilyTopic: "news",
    subtopics: {
      law_policy: {
        core: [
          "luật", "nghị định", "thông tư", "bộ công an", "vksnd", "viện kiểm sát", "tòa án",
          "khởi tố", "bắt tạm giam", "xét xử", "án tù", "tham nhũng", "xác thực danh tính",
          "sáp nhập hành chính", "xử phạt", "pháp luật", "tư pháp", "cải cách"
        ],
        context: ["chính sách", "quy định", "nhà nước", "chính phủ", "quốc hội", "cấm bán", "thuế"]
      },
      urban_life: {
        core: [
          "quy hoạch", "giao thông", "ô nhiễm", "không khí", "ngập lụt", "giáo dục", "điểm thi",
          "y tế", "bệnh viện", "hiến tạng", "bảo hiểm xã hội", "lương hưu", "giá xăng", "giá điện",
          "sân bay", "metro", "đường sắt", "xe điện", "tỷ lệ sinh"
        ],
        context: ["hà nội", "tp.hcm", "sài gòn", "đô thị hóa", "dân sinh", "hạ tầng", "vỉa hè"]
      },
      people_culture: {
        core: [
          "dư luận", "xã hội", "văn hóa", "thế hệ", "đạo đức", "lừa đảo", "đường dây",
          "cộng đồng", "quyền riêng tư", "tệ nạn", "bạo lực"
        ],
        context: ["người dân", "sinh viên", "gia đình", "trẻ em", "người cao tuổi", "việt nam"]
      }
    }
  },
  WORLD_GEO: {
    route: "TAVILY",
    tavilyTopic: "news",
    subtopics: {
      geopolitics: {
        core: [
          "địa chính trị", "chiến tranh", "xung đột", "quân sự", "hạt nhân", "bầu cử",
          "tổng thống", "ngoại giao", "trừng phạt", "thuế quan", "biên giới", "lãnh thổ",
          "bản đồ lưỡi bò", "liên hợp quốc", "nato", "ủy ban châu âu", "thế chiến"
        ],
        context: ["quốc tế", "cường quốc", "chính quyền", "đồng minh", "căng thẳng", "đàm phán"]
      },
      global_events: {
        core: [
          "thiên tai", "động đất", "bão lũ", "biến đổi khí hậu", "dịch bệnh", "khủng hoảng",
          "tích trữ lương thực", "túi sinh tồn", "công nghệ vũ trụ", "vệ tinh"
        ],
        context: ["thế giới", "toàn cầu", "châu âu", "châu á", "trung đông", "khẩn cấp"]
      }
    }
  },
  SOCIAL_TREND: {
    route: "EXA",
    tavilyTopic: "general",
    subtopics: {
      viral_drama: {
        route: "EXA",
        tavilyTopic: "general",
        core: [
          "drama", "phốt", "bóc phốt", "scandal", "viral", "tẩy chay", "tranh cãi",
          "mạng xã hội", "phông bạt", "tin đồn", "fact check", "kiểm chứng"
        ],
        context: ["kol", "tiktok", "facebook", "threads", "reddit", "xôn xao", "cư dân mạng"]
      },
      sports_ent: {
        route: "TAVILY",
        tavilyTopic: "news",
        core: [
          "bóng đá", "tỉ số", "tỷ số", "lịch thi đấu", "bảng xếp hạng", "vô địch", "bàn thắng",
          "chung kết", "bán kết", "tứ kết", "huy chương", "concert", "phim chiếu rạp", "giải đấu",
          "bóng bàn", "tennis", "cầu lông", "olympic", "world cup"
        ],
        context: ["trận đấu", "đội tuyển", "cầu thủ", "huấn luyện viên", "ca sĩ", "diễn viên", "vé xem"]
      }
    }
  },
  LIFESTYLE: {
    route: "TAVILY",
    tavilyTopic: "general",
    subtopics: {
      shopping_review: {
        core: [
          "review", "đánh giá sản phẩm", "so sánh", "đáng mua", "giá bán", "mua ở đâu",
          "voucher", "săn sale", "chính hãng", "bảo hành", "đồ gia dụng", "máy sấy", "bếp từ"
        ],
        context: ["giá", "rẻ", "đắt", "chất lượng", "thông số", "mẫu mới", "ưu nhược điểm"]
      },
      career_work: {
        core: [
          "tuyển dụng", "phỏng vấn", "thang bảng lương", "lương thưởng", "nhảy việc",
          "văn hóa doanh nghiệp", "quản lý nhân sự", "wfh", "onboarding", "luật lao động",
          "chuyển đổi nghề nghiệp", "nghỉ hưu", "risk management"
        ],
        context: ["công việc", "sự nghiệp", "thử việc", "hợp đồng", "kpi", "đồng nghiệp", "sếp"]
      },
      travel_food: {
        core: [
          "thời tiết", "dự báo thời tiết", "nhiệt độ", "du lịch", "homestay", "khách sạn",
          "vé máy bay", "quán ăn", "nhà hàng", "quán cà phê", "địa điểm", "lịch trình"
        ],
        context: ["ăn gì", "đi đâu", "ngon", "đặt phòng", "bay", "chuyến đi", "nghỉ lễ"]
      }
    }
  }
};

// RAM cache cho index đã chuẩn hóa để đạt tốc độ < 1ms/query
let compiledCacheRef = null;
let compiledEntries = null;

const buildCompiledIndex = (taxonomy) => {
  const entries = [];
  for (const [domainName, domainCfg] of Object.entries(taxonomy || {})) {
    if (!domainCfg || !domainCfg.subtopics) continue;
    for (const [subName, subCfg] of Object.entries(domainCfg.subtopics)) {
      if (!subCfg) continue;
      const prep = (list) => (Array.isArray(list) ? list : [])
        .map(w => String(w || "").trim().toLowerCase())
        .filter(w => w.length >= 2)
        .map(w => ({
          raw: w,
          noAccent: removeAccents(w),
          isMultiWord: w.includes(" ")
        }));

      entries.push({
        domain: domainName,
        subTopic: subName,
        route: (subCfg.route || domainCfg.route || "TAVILY").toUpperCase(),
        tavilyTopic: subCfg.tavilyTopic || domainCfg.tavilyTopic || "general",
        core: prep(subCfg.core),
        context: prep(subCfg.context)
      });
    }
  }
  return entries;
};

/**
 * Phân loại câu truy vấn theo cây Taxonomy 3 tầng (Weighted Scoring, <1ms, $0).
 * Tên riêng không có trong taxonomy sẽ tự động định tuyến theo ngữ cảnh đi kèm,
 * hoặc rơi về GENERAL (Tavily general) nếu là tên riêng thuần túy.
 */
const classifyQuery = (query, taxonomyConfig = null) => {
  const activeTaxonomy = (taxonomyConfig && typeof taxonomyConfig === "object" && Object.keys(taxonomyConfig).length > 0)
    ? taxonomyConfig
    : DEFAULT_TAXONOMY;

  if (compiledCacheRef !== activeTaxonomy || !compiledEntries) {
    compiledEntries = buildCompiledIndex(activeTaxonomy);
    compiledCacheRef = activeTaxonomy;
  }

  const rawLower = String(query || "").toLowerCase();
  const padded = ` ${rawLower.replace(/[.,!?()[\]{}"':;/\\|]/g, " ").replace(/\s+/g, " ").trim()} `;
  const paddedNoAccent = ` ${removeAccents(padded)} `;

  let best = {
    domain: "GENERAL",
    subTopic: "general",
    route: "TAVILY",
    tavilyTopic: "general",
    score: 0,
    matchedConcepts: []
  };

  for (const entry of compiledEntries) {
    let score = 0;
    const matched = [];

    for (const item of entry.core) {
      if (padded.includes(` ${item.raw} `) || paddedNoAccent.includes(` ${item.noAccent} `)) {
        score += item.isMultiWord ? 3.5 : 3;
        matched.push(item.raw);
      }
    }

    for (const item of entry.context) {
      if (padded.includes(` ${item.raw} `) || paddedNoAccent.includes(` ${item.noAccent} `)) {
        score += item.isMultiWord ? 1.5 : 1;
        matched.push(item.raw);
      }
    }

    if (score > best.score) {
      best = {
        domain: entry.domain,
        subTopic: entry.subTopic,
        route: entry.route,
        tavilyTopic: entry.tavilyTopic,
        score,
        matchedConcepts: matched
      };
    }
  }

  return best;
};

/**
 * Hợp nhất an toàn các khái niệm mới (do Nightly Evolution đề xuất) vào cây Taxonomy.
 * Giữ Hard Cap mỗi sub-topic để database không bao giờ phình to.
 */
const mergeTaxonomy = (existingTaxonomy, proposals = [], maxPerTier = 25) => {
  const base = JSON.parse(JSON.stringify(
    (existingTaxonomy && typeof existingTaxonomy === "object" && Object.keys(existingTaxonomy).length > 0)
      ? existingTaxonomy
      : DEFAULT_TAXONOMY
  ));

  const added = [];
  for (const prop of (Array.isArray(proposals) ? proposals : [])) {
    if (!prop || !prop.domain || !prop.subtopic || !prop.concept) continue;
    const domainKey = String(prop.domain).trim().toUpperCase();
    const subKey = String(prop.subtopic).trim().toLowerCase();
    const tier = prop.tier === "context" ? "context" : "core";
    const concept = String(prop.concept).trim().toLowerCase();

    if (concept.length < 3 || concept.length > 40) continue;
    if (!base[domainKey] || !base[domainKey].subtopics || !base[domainKey].subtopics[subKey]) continue;

    const sub = base[domainKey].subtopics[subKey];
    sub.core = Array.isArray(sub.core) ? sub.core : [];
    sub.context = Array.isArray(sub.context) ? sub.context : [];

    const existingAll = new Set([...sub.core, ...sub.context].map(x => String(x).toLowerCase().trim()));
    if (existingAll.has(concept)) continue;

    if (sub[tier].length < maxPerTier) {
      sub[tier].push(concept);
      added.push(`${domainKey}.${subKey}.${tier}:${concept}`);
    }
  }

  return { taxonomy: base, added };
};

module.exports = {
  DEFAULT_TAXONOMY,
  classifyQuery,
  mergeTaxonomy
};
