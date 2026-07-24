const { searchTavily, TODAY_KEYWORDS } = require("./tavily");
const { searchExa } = require("./exa");
const axios = require("axios");
const path = require("path");
const fs = require("fs");

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

let stopWordsList = [
  "ngay", "nam", "thoi", "tiet", "lich", "thi", "dau", "cho", "xin", "em", "oi", "cai", "nay", "voi", "anh", "chi", "la", "gi", "ai", "xem", "tin", "tuc", "moi", "nhat", "hot", "sao", "va", "cua"
];

try {
  const stopWordsPath = path.join(__dirname, "stopwords.json");
  if (fs.existsSync(stopWordsPath)) {
    stopWordsList = JSON.parse(fs.readFileSync(stopWordsPath, "utf8"));
  }
} catch (err) {
  console.error("[Search Router] Lỗi nạp stopwords.json:", err.message);
}

/**
 * Trích xuất từ khóa tìm kiếm (Dùng Regex nội bộ thay vì LLM để giảm độ trễ).
 * @param {string} contextualPrompt - Câu nói đã được bù đắp ngữ cảnh
 * @returns {Promise<{query: string, has_entity: boolean}>}
 */
const extractSearchQuery = async (contextualPrompt) => {
  // 1. Loại bỏ dấu câu trước để tránh cản trở ranh giới từ của các từ rác
  let query = contextualPrompt.replace(/[.,?!]/g, " ").replace(/\s+/g, ' ').trim();

  // 2. Bộ từ rác (noise words) và chỉ thị tìm kiếm để làm sạch truy vấn
  const noiseWords = [
    "annie ơi", "annie", "bot ơi", "bot", "cho anh hỏi", "cho em hỏi", "cho mình hỏi", "hỏi xíu",
    "tìm kiếm", "tìm giúp", "tìm giùm", "tra cứu", "tra giúp", "tra giùm", "xem giúp", "xem giùm", "giúp anh", "giúp em",
    "cho anh", "cho em", "cho chị", "cho mình", "với", "nhé", "nha", "đi", "ạ", "ơi",
    "chưa em", "chưa anh", "nhỉ", "có trận nào", "có ai", "có...không", "có...chưa",
    "thế nào", "ra sao", "chi tiết hơn", "thông tin", "kể về", "biết gì", "nào",
    "tổng hợp", "đánh giá", "về nhân vật", "về", "được cho là", "làm việc tại", "làm việc", "tin đồn", "tin tức về", "và"
  ];
  
  for (const word of noiseWords) {
    // Sử dụng bộ lọc khoảng trắng ranh giới an toàn cho ký tự Unicode thay thế cho \b
    query = query.replace(new RegExp(`(?:^|\\s)${word}(?:$|\\s)`, 'gi'), " ");
  }
  
  // 3. Làm sạch khoảng trắng thừa
  query = query.replace(/\s+/g, ' ').trim();

  // Fallback nếu xóa xong rỗng
  if (!query) query = contextualPrompt.replace(/[.,?!]/g, " ").replace(/\s+/g, ' ').trim();

  // Nhận diện có cần search không (thay thế cho LLM has_entity)
  // Check viết hoa (Bỏ qua ký tự đầu tiên của câu)
  const hasCapitalized = /[A-ZĐ]/.test(query.substring(1));
  
  // Check các từ khóa đặc biệt
  const specialKeywords = ["lịch", "tỷ số", "tỉ số", "kết quả", "kqxs", "giá", "thời tiết", "bóng đá", "tứ kết", "bán kết", "chung kết", "trận", "tin tức", "điểm thi", "bầu cử", "chứng khoán", "vàng sjc"];
  const hasSpecial = specialKeywords.some(kw => query.toLowerCase().includes(kw));

  // Chấp nhận has_entity nếu có chữ viết hoa, từ khóa đặc biệt, hoặc cụm từ tìm kiếm từ 2 từ trở lên
  const has_entity = hasCapitalized || hasSpecial || query.split(/\s+/).filter(w => w.length > 0).length >= 2;
  
  console.log(`[Regex Extractor] Original: "${contextualPrompt}" -> Extracted: "${query}", has_entity: ${has_entity}`);
  
  return { query, has_entity };
};

// ─── Regex lọc URL ───────────────────────────────────────────────────────────
const URL_REGEX = /(https?:\/\/[^\s"'>\]]+)/gi;

// ─── Từ khóa nhận diện câu hỏi cần search ───────────────────────────────────
const SEARCH_KEYWORDS = [
  "tìm", "tra cứu", "search", "giá", "thời tiết", "tin tức", "hôm nay", "hum nay", "nay", "mới nhất",
  "tỷ giá", "kết quả", "lịch", "bao nhiêu", "ngày", "đêm", "triệu chứng", "thuốc",
  "xổ số", "vàng", "kqxs", "cập nhật", "recent", "news", "latest", "bóng đá", "hôm qua",
  "đá lúc mấy giờ", "chiếu kênh nào", "bản đồ", "địa chỉ", "giá xăng", "đăng ký",
  "mua ở đâu", "tại sao", "như thế nào", "là ai", "là cái gì", "là gì",
  "đội", "trận", "thắng", "thua", "vô địch", "bàn thắng", "ghi bàn", "tỉ số",
  "tin hot", "fact check", "kiểm chứng", "sự thật", "tin chuẩn", "tin thật",
  "thông tin", "tổng hợp", "chi tiết", "chi tiế", "tiểu sử", "tác giả", "scandal", "drama", "phốt", "hướng dẫn",
  "vàng sjc", "bầu cử", "tổng thống mỹ", "thị trường chứng khoán", "chứng khoán"
];

// ─── Mẫu câu hỏi về giờ/ngày hiện tại — KHAI KHÔNG search (bot tự biết từ system prompt) ───
const SKIP_SEARCH_PATTERNS = [
  /bây giờ (là )?(mấy giờ|ngày mấy)/i,
  /mấy giờ rồi/i, /giờ mấy rồi/i,
  /hôm nay là ngày mấy/i, /ngày mấy rồi/i,
  /bây giờ là bao nhiêu giờ/i,
  /ngủ/i
];

const QUESTION_PATTERNS = [
  /ai là/i, /cái gì/i, /ở đâu/i, /khi nào/i,
  /thế nào/i, /như thế nào/i, /làm sao để/i, /hướng dẫn cách/i,
  /thì sao/i, /còn.+không/i, /cho hỏi/i, /biết gì về/i, /kể về/i
];

/**
 * Kiểm tra offline xem câu hỏi có cần tìm kiếm Internet không.
 * Synchronous, phản hồi tức thì — không gọi API nào bên ngoài.
 * @param {string} prompt
 * @returns {boolean}
 */
const checkNeedsSearch = (prompt) => {
  const query = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!query) return false;
  // Ưu tiên bỏ qua trước: câu hỏi thời gian hiện tại bot tự biết, không cần search
  if (SKIP_SEARCH_PATTERNS.some(p => p.test(query))) {
    console.log(`[Search Router] Bỏ qua search (câu hỏi thời gian hiện tại): "${query}"`);
    return false;
  }
  if (SEARCH_KEYWORDS.some(kw => query.includes(kw))) {
    console.log(`[Search Router] Khớp từ khóa → cần search: "${query}"`);
    return true;
  }
  if (QUESTION_PATTERNS.some(p => p.test(query))) {
    console.log(`[Search Router] Khớp regex → cần search: "${query}"`);
    return true;
  }
  console.log(`[Search Router] Không cần search: "${query}"`);
  return false;
};

/**
 * Tải và trích xuất nội dung văn bản thuần từ một URL.
 * @param {string} url
 * @returns {Promise<string|null>}
 */
const scrapeUrl = async (url) => {
  const axios = require("axios");
  try {
    const { data: html } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" },
      timeout: 8000
    });
    if (typeof html !== "string") return null;

    const bodyMatch = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    const text = (bodyMatch ? bodyMatch[1] : html)
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    return text || null;
  } catch (error) {
    console.error("[Scraper] Lỗi đọc URL:", url, error.message);
    return null;
  }
};

/**
 * Xây dựng ngữ cảnh web cho câu hỏi của người dùng.
 * Ưu tiên scrape URL nếu có, ngược lại dùng Tavily search nếu cần.
 * @param {string} prompt - Câu chat gốc của người dùng (có thể chứa URL, @mention)
 * @param {boolean} isPreOptimized - Đã tối ưu search query chưa
 * @param {string|null} sessionId - ID phiên trò chuyện để đọc/ghi cache
 * @returns {Promise<Object>} Chuỗi ngữ cảnh web và danh sách urls nguồn
 */
const resolveWebContext = async (prompt, isPreOptimized = false, sessionId = null) => {
  const urls = prompt.match(URL_REGEX);
  let urlText = null;

  if (urls && urls.length > 0) {
    const targetUrl = urls[0];
    console.log(`[Scraper] Đọc nội dung từ: ${targetUrl}`);
    urlText = await scrapeUrl(targetUrl);
  }

  // Tải cache webContext ngắn hạn (5 phút) trên RTDB để tối ưu chi phí
  const { rtdb } = require("./db");
  const now = Date.now();
  let cachedContext = "";
  let cachedUrls = [];

  const cleanPrompt = prompt
    .replace(/\[đang trả lời tin nhắn của[^\]]*\]\s*/gi, "")
    .replace(/^"[^"]{0,600}"\s*/g, "")
    .replace(/@[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const isFollowUp = 
    isPreOptimized ||
    cleanPrompt.split(" ").length <= 5 ||
    /nguồn.*là gì|nguồn.*gì|nguồn đâu|link đâu|ở đâu ra|chi tiết hơn|tại sao|giải thích thêm|giải thích rõ|nêu rõ|nguồn [0-9]/i.test(cleanPrompt);

  if (sessionId && isFollowUp) {
    try {
      const cacheSnap = await rtdb.ref(`chats/${sessionId}/metadata/last_web_context`).once("value");
      if (cacheSnap.exists()) {
        const cacheData = cacheSnap.val();
        if (cacheData && cacheData.createdAt && (now - cacheData.createdAt < 5 * 60 * 1000)) {
          // So khớp từ khóa động (Dynamic Keyword Matching) để phát hiện lệch chủ đề
          const normalizedPrompt = removeAccents(cleanPrompt.toLowerCase());
          const queryKeywords = normalizedPrompt.split(/[\s,.\-?!\/]+/)
            .filter(w => w.length >= 3 && !stopWordsList.includes(w));
          
          const cacheLowerContext = removeAccents((cacheData.context || "").toLowerCase());
          const isTopicMismatch = queryKeywords.some(kw => !cacheLowerContext.includes(kw));

          if (!isTopicMismatch) {
            console.log(`[Search Router] TÁI SỬ DỤNG CACHE webContext cho câu hỏi nối tiếp: "${cleanPrompt}"`);
            cachedContext = cacheData.context || "";
            cachedUrls = cacheData.urls || [];
            
            if (!urlText && !cachedContext) return { context: "", urls: [] };
            let context = "";
            if (urlText) context += `\n\n[NỘI DUNG URL NGƯỜI DÙNG GỬI ĐẾN]:\n${urlText}\n`;
            if (cachedContext) context += cachedContext;
            
            return { context, urls: cachedUrls };
          } else {
            console.log(`[Search Router] Phát hiện lệch chủ đề (từ khóa lệch: ${queryKeywords.filter(kw => !cacheLowerContext.includes(kw)).join(", ")}). Bỏ qua cache.`);
          }
        }
      }
    } catch (e) {
      console.error("[Search Router] Lỗi đọc cache webContext:", e.message);
    }
  }

  let searchSummary = "";
  let searchUrls = [];
  if (isPreOptimized || checkNeedsSearch(prompt)) {
    let finalQuery = prompt;
    let cleanQuery = prompt.replace(/@[^\s]+/g, "").replace(/\s+/g, " ").trim();

    if (!isPreOptimized) {
      const extractionResult = await extractSearchQuery(cleanQuery);
      
      if (!extractionResult.has_entity) {
        console.log(`[Search Router] Bị chặn do thiếu Danh từ riêng (has_entity = false)`);
        return { context: "", urls: [] };
      }
      finalQuery = extractionResult.query;
    }
    
    const { TODAY_KEYWORDS } = require("./tavily");
    const isTodaySensitive = TODAY_KEYWORDS.some(kw => cleanQuery.toLowerCase().includes(kw));
    if (isTodaySensitive) {
      const todayStr = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      finalQuery = `${finalQuery} ngày ${todayStr}`;
    } else {
      if (!/\b20\d{2}\b/.test(finalQuery)) {
        const currentYear = new Date().getFullYear();
        finalQuery = `${finalQuery} năm ${currentYear}`;
      }
    }

    const CATEGORY_REGEX = {
      NEWS: /bóng đá|tứ kết|trận|kết quả|tỉ số|tỷ số|tin tức|thời sự|chính trị|sông nhuệ|sản xuất ô tô|bắt giữ|ăn cắp dữ liệu|giảng viên bk kinh doanh|khu đô thị tod|contagious interview|svg steganography|1 tỷ in sách ông nam|nữ sinh tử vong vĩnh long|khởi tố cựu viện trưởng|lực lượng 47|page chính trị|wc|giày vàng|tỷ số 4-6|lừa đảo chuyển nhầm tiền|chung cư có thời hạn sở hữu|madam châu hanoi telecom|quan hệ thương mại việt - trung - mỹ|u cà|mặt trận uav|nhà xuất bản hội nhà văn|công an ko phải đóng thuế|chung cư có thời hạn|tách thi dh với tốt nghiệp|vinashin, vinaline|nguyễn bá dương|dự án khu đô thị đại kim - định công|tuyên phạt|triệu đà|tô lâm|bộ luật hình sự sửa đổi 2026|elastic security labs|ref9403|contagious interview|ottercookie|supply chain attack|zero detection|contagious interview malware|hacker tấn công dev|thất nghiệp tuổi trung niên|thị trường lao động việt nam|chính sách khuyến khích|hàng giả mạo nhãn hiệu|vi phạm pháp luật|iphone fold|điện thoại gập apple|ốp lưng iphone fold|samsung galaxy z fold 7|con gái chủ tịch|minh hoàng|cụ vượng|thời tiết hn hôm nay|kết quả trận anh argentina|world cup 2026|các nơi sập hết|cầm hoà|tổng bí thư|công an thu bản quyền doanh nghiệp|a05 lưu ý bản quyền|mỹ để ý vn bản quyền|chặn site cá độ wc|người đàn ông bình dương trúng số 5 lần|ps4 pro game hack|ps4 pro game|call of duty: modern warfare iii|marvel's spider-man 2|hogwarts legacy|god of war ragnarök|line yahoo sa thải|line yahoo 40 tuổi|itmedia nhật bản|thời tiết hà nội|world cup 2026|argentina|messi|anh thua|highlights trận france|m10 lên top 1|hiệp sĩ bell|râu con|penalty đầu|argentina vs canada|bán kết 2 copa america 2026|copa america 2026 lịch thi đấu bán kết|usa vs uruguay|jude bellingham|euro 2026|anh đá bán kết với hà lan|bồ đào nha bị loại|world cup đã kết thúc|sự đánh đồng giữa trách nhiệm quản lý với quan điểm cá nhân|nguyễn thành nam|trần việt anh|cuốn sách chuyện với thanh|báo tuổi trẻ|đào quang huy|tổng hợp tin hot nhất chiều nay|công an úp sọt bản quyền doanh nghiệp|robot đại chiến võ thuật|thời tiết hn hôm nay|vị thế tq|long tứ|mất|nytro security|vụ nữ sinh vĩnh long|khởi tố cựu viện trưởng|trung tướng đinh văn nơi|phó bí thư tỉnh ủy an giang|vụ bmw tông nữ sinh|400 triệu giao dịch|cao tốc quốc lộ|vành đai|femboysec intelligence|15tb dữ liệu|dữ liệu chính phủ việt nam|bộ y tế|rò rỉ dữ liệu pii|bộ nông nghiệp và phát triển nông thôn mard|world cup 2026|argentina|tbn|thẻ đỏ|trần việt anh founder spiderum|nguyễn thành nam cựu hiệu trưởng vinuni|nguyễn thành nam bị bắt giữ|llm|bản kiến nghị giả mạo argentina world cup|world cup 2026|thời tiết hà nội tối nay|thành tích tây ban nha world cup 2026|chung kết world cup 2026|messi|cucurella|fifa|tang tan openai|năng lực sản xuất|thị trường ô tô trung quốc|evergreen|cho thuê vỉa hè hà nội|dự thảo nghị quyết cho thuê vỉa hè|world cup|fifa|trump|nguyễn thành nam|vinuni|vnexpress.net|chung kết|tây|tbn|barca|richa|ronaldo nazario|world cup 2026|cristiano ronaldo|vnexpress.net|al nassr|euro 2028|agent i line yahoo|nba free agency|euro 2026|gemini 3.0|chính sách vỉa hè hà nội|sổ đỏ ủy quyền|tham nhũng vặt hành chính|phường xã hội chủ nghĩa|chung cư có thời hạn|nguyễn thành nam chống phá nhà nước|cho thuê vỉa hè hà nội|geleximco cải tạo sông nhuệ|sản xuất ô tô việt nam 6 tháng|linh cảnh hành giả|mại báo tiểu lang quân|thời tiết hà nội tối nay|ông nguyễn thành nam mới bị bắt giữ là ai/i,
      FINANCE: /giá vàng|tỷ giá|chứng khoán|cổ phiếu|vnindex|peso|lạm phát|nhập khẩu|thương mại|tuyến đường ven biển 9500 tỷ đồng|giá ram 32gb|tỷ phú ai|chi phí token ai|hutchison đầu tư việt nam|thương vụ evn telecom|vinfast tương lai|nhập siêu tq|tăng lương tối thiểu vùng|thuế thu nhập cá nhân|hùn 20 triệu|500 tỏi|ai tài chính|crypto|quy định chuyển tiền trực tuyến|ai tài chính vibe-trading|ví crypto|chi phí lương cao|giá iphone fold|chuỗi cung ứng bản lề apple|kế nhiệm|tập đoàn|ipo|lợi tức|từ 400 triệu đồng giao dịch chuyển tiền|coin|bds|nợ công|đầu tư công|gdp|fdi|evergrande|trúng số 80 tỷ|vibe-trading|shadow account|giá xăng dầu|chứng khoán quốc tế|mua mã chứng khoán nào|vay vốn|bidv|factor và alpha zoo|backtest|shadow account|bản quyền windows|chaebol|keiretsu|viettel|hộ kinh doanh|tài chính|vinhomes mê linh|trần bá dương thaco|đại quang minh|đồng peso argentina|lạm phát argentina|vnd rủi ro lạm phát|nhập khẩu trung quốc việt nam 2026|phụ thuộc trung quốc việt nam/i,
      DEV: /code|lập trình|lỗi|api|react|nodejs|github|tech-verse|multi-agent|flava|coding|bug prod|tuning bot|bami-translator|token charge phí|app mobile|train a.i.|llm|ubuntu|máy đọc nfc thẻ căn cước công dân|vnpt idc nam thăng long|chứng chỉ tier-3|cmc idc|hitc dc hòa lạc|hệ thống lọc gói tin|deepseek|agent ai|reinforcement learning|llm + tool call|số hóa công ty netnam|bami translator|ai dịch quyển|vibe-trading|ai code|opus|gemini flash|llm|developer|svg steganography|credential trình duyệt|backdoor rat|side job|svg steganography|thích ứng công nghệ|cập nhật kỹ năng|thông số kỹ thuật iphone fold|màn hình gập không nếp gấp|ai code thuật toán|tool dịch sách|tri nam|truy vết người phát tán nội dung độc hại khách sạn|factor layer|backtest layer|structure lên|software development jobs|agentmemory|urkl|ai tự chủ|ai-agent-book|ai agent|ai|llms security|claude code|cơ quan điều tra vks|chatid|mạng điều khiển trên tàu biển|can bus|nmea 2000|kafka|rabbit|tool calling|function calling|stateless|db vector|mcp|realtime|tune những gì|a.i workforce|llm|ocr|text2speech|moe (mixture of experts)|mô hình multimodal|gemini|mixtral|gpt-4v|claude|tesseract|abbyy finereader|ocrmypdf|coqui tts|elevenlabs|ai và robot|huawei|ai lập trình frontend|agentic coding|flava api gateway|quotio tool|quản lý tài khoản ai|guardrail ai|tech-verse 2026|add-on kodi python|stremio api|gemini code|secret token|knowledge base|reinforcement learning|llm|input text|context|tool call|vector|rag|claude fable|pxpipe|âm thanh|spectrogram|tiết kiệm token|ảo giác|moe|image|video|sound|line yahoo ai prototyping|trang này không tồn tại|software development jobs 2026|ai trong dev|multi agent system|self improvement bot|tech-verse 2026 multi-agent debate|flava api gateway agentic coding|real bug prod/i,
      SOCIAL: /drama|phốt|cộng đồng mạng|twitter|x\b|ronaldo|cầu thủ/i
    };

    let category = "GENERAL";
    if (CATEGORY_REGEX.DEV.test(finalQuery)) category = "DEV";
    else if (CATEGORY_REGEX.SOCIAL.test(finalQuery)) category = "SOCIAL";
    else if (CATEGORY_REGEX.NEWS.test(finalQuery) || CATEGORY_REGEX.FINANCE.test(finalQuery)) category = "NEWS";

    console.log(`[Search Router] Kích hoạt tìm kiếm: "${finalQuery}" | Category: ${category}`);
    
    try {
      if (category === "DEV" || category === "SOCIAL") {
        // Exa không còn hỗ trợ danh mục "tweet" và "github", thực hiện tìm kiếm chung không kèm category
        const res = await searchExa(finalQuery);
        if (res) { searchSummary = res.summary; searchUrls = res.urls; }
      } else {
        const tavilyTopic = category === "NEWS" ? "news" : "general";
        const res = await searchTavily(finalQuery, { topic: tavilyTopic });
        if (res) { searchSummary = res.summary; searchUrls = res.urls; }
      }
    } catch (err) {
      console.log(`[Search Router] Nguồn chính lỗi, chạy fallback: ${err.message}`);
      try {
        if (category === "DEV" || category === "SOCIAL") {
          const res = await searchTavily(finalQuery);
          if (res) { searchSummary = res.summary; searchUrls = res.urls; }
        } else {
          const res = await searchExa(finalQuery);
          if (res) { searchSummary = res.summary; searchUrls = res.urls; }
        }
      } catch (fallbackErr) {
        console.error(`[Search Router] Cả Tavily và Exa đều lỗi.`);
      }
    }
    
    searchSummary = searchSummary.trim();
  }

  // Không inject gì nếu không có dữ liệu — tránh lãng phí token
  if (!urlText && !searchSummary) return { context: "", urls: [] };

  let context = "";
  if (urlText) context += `\n\n[NỘI DUNG URL NGƯỜI DÙNG GỬI ĐẾN]:\n${urlText}\n`;
  
  let internetContext = "";
  if (searchSummary) {
    internetContext = `\n\n[THÔNG TIN TỪ INTERNET]:\n${searchSummary}\n`;
    context += internetContext;
  }

  // Lưu cache mới vào RTDB
  if (sessionId && searchSummary) {
    rtdb.ref(`chats/${sessionId}/metadata/last_web_context`).set({
      context: internetContext,
      urls: searchUrls || [],
      createdAt: now
    }).catch(e => console.error("[Search Router] Lỗi ghi cache webContext:", e.message));
  }

  return { context, urls: searchUrls || [] };
};

module.exports = { checkNeedsSearch, scrapeUrl, resolveWebContext };
