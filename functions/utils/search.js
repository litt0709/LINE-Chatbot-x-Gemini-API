const { searchTavily, extractTavily, TODAY_KEYWORDS } = require("./tavily");
const { searchExa } = require("./exa");
const { getBotConfig } = require("./configCache");
const { classifyQuery } = require("./taxonomyRouter");
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

const DOMAIN_REGEX = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(com|vn|net|org|cn|io|ai|edu|gov)\b/i;

/**
 * Trích xuất từ khóa tìm kiếm (Dùng Regex nội bộ thay vì LLM để giảm độ trễ).
 * @param {string} contextualPrompt - Câu nói đã được bù đắp ngữ cảnh
 * @returns {Promise<{query: string, has_entity: boolean}>}
 */
const extractSearchQuery = async (contextualPrompt) => {
  // 1. Bảo vệ tên miền (domain) tránh bị xóa dấu chấm
  const domainTokens = [];
  let tempPrompt = contextualPrompt.replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(com|vn|net|org|cn|io|ai|edu|gov)\b/gi, (match) => {
    domainTokens.push(match);
    return `__DOMAIN_TOKEN_${domainTokens.length - 1}__`;
  });

  // Loại bỏ tiền tố tên người dùng dạng [Tên]: hoặc Tên]: nếu có, và xóa dấu câu
  let query = tempPrompt
    .replace(/^\[?[^\]:]+\]?[:\s]+/g, " ")
    .replace(/[.,?!]/g, " ")
    .replace(/\s+/g, ' ')
    .trim();

  // Khôi phục tên miền nguyên bản
  domainTokens.forEach((token, idx) => {
    query = query.replace(`__DOMAIN_TOKEN_${idx}__`, token);
  });

  // 2. Bộ từ rác (noise words) và chỉ thị tìm kiếm để làm sạch truy vấn
  const noiseWords = [
    "annie ơi", "annie", "bot ơi", "bot", "cho anh hỏi", "cho em hỏi", "cho mình hỏi", "hỏi xíu",
    "tìm kiếm", "tìm giúp", "tìm giùm", "tra cứu", "tra giúp", "tra giùm", "xem giúp", "xem giùm", "giúp anh", "giúp em",
    "kiểm tra xem", "kiểm tra giúp", "kiểm tra giùm", "kiểm tra", "check giúp", "check giùm", "check", "xác minh", "xác thực",
    "cho anh", "cho em", "cho chị", "cho mình", "với", "nhé", "nha", "đi", "ạ", "ơi", "bạn",
    "chưa em", "chưa anh", "nhỉ", "có trận nào", "có ai", "có...không", "có...chưa",
    "thế nào", "ra sao", "chi tiết hơn", "thông tin", "kể về", "biết gì", "nào",
    "tổng hợp", "đánh giá", "về nhân vật", "về", "được cho là", "làm việc tại", "làm việc", "tin đồn", "tin tức về", "và",
    "có tin", "vụ này"
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
  
  // Check các từ khóa đặc biệt hoặc có tên miền
  const specialKeywords = ["lịch", "tỷ số", "tỉ số", "kết quả", "kqxs", "giá", "thời tiết", "bóng đá", "tứ kết", "bán kết", "chung kết", "trận", "tin tức", "điểm thi", "bầu cử", "chứng khoán", "vàng sjc"];
  const hasSpecial = specialKeywords.some(kw => query.toLowerCase().includes(kw)) || DOMAIN_REGEX.test(query);

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
  "lỗi", "sập", "outage", "bảo trì", "không vào được", "lag", "disconnect",
  "tin hot", "fact check", "kiểm chứng", "sự thật", "tin chuẩn", "tin thật",
  "thông tin", "tổng hợp", "chi tiết", "chi tiế", "tiểu sử", "tác giả", "scandal", "drama", "phốt", "hướng dẫn",
  "vàng sjc", "bầu cử", "tổng thống mỹ", "thị trường chứng khoán", "chứng khoán",
  "kiểm tra", "check", "xác minh", "xác thực", "tin đồn", "vụ này"
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
  if (DOMAIN_REGEX.test(query)) {
    console.log(`[Search Router] Khớp tên miền web → cần search: "${query}"`);
    return true;
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

// ─── Headers mô phỏng hoàn chỉnh Trình duyệt End-User (Chrome macOS) ─────────
const ENDUSER_BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "max-age=0",
  "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"macOS\"",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1"
};

/**
 * Trích xuất cấu trúc thông tin sản phẩm Amazon từ HTML (chỉ áp dụng cho trang sản phẩm e-commerce)
 * @param {string} html 
 * @param {string} url
 * @returns {string|null}
 */
const parseAmazonHtml = (html, url = "") => {
  if (!html || typeof html !== "string") return null;
  const isBlocked = /validateCaptcha|Robot Check|Attention Required|triggerInterstitialChallenge|bm-verify/i.test(html);
  if (isBlocked) return null;

  // CHỈ áp dụng cho sản phẩm E-commerce (có productTitle hoặc URL chứa /dp/, /gp/product/)
  const isProductUrl = /\/(?:dp|gp\/product)\//i.test(url);
  const prodTitleMatch = html.match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/i);
  if (!prodTitleMatch && !isProductUrl) {
    // Không phải trang sản phẩm Amazon (ví dụ: AWS Blog, tin tức, tài liệu kỹ thuật), trả về null để luồng đọc bài viết thông thường xử lý
    return null;
  }

  const titleMatch = prodTitleMatch || html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
  if (!title || title.includes("Page Not Found")) return null;

  const priceMatch = html.match(/class="a-price[^"]*"[^>]*>[\s\S]*?<span class="a-offscreen">([^<]+)<\/span>/i) || html.match(/\$[\d,]+\.?\d*/i);
  const price = priceMatch ? (priceMatch[1] || priceMatch[0] || "").trim() : "";

  const byLineMatch = html.match(/id="bylineInfo"[^>]*>([\s\S]*?)<\/div>/i);
  const byLine = byLineMatch ? byLineMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";

  const featureMatch = html.match(/id="feature-bullets"[^>]*>([\s\S]*?)<\/div>/i);
  const features = featureMatch ? featureMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";

  const descMatch = html.match(/id="bookDescription_feature_div"[^>]*>([\s\S]*?)<\/div>/i) || html.match(/id="productDescription"[^>]*>([\s\S]*?)<\/div>/i);
  const desc = descMatch ? descMatch[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : "";

  // Nếu không có bất kỳ thông tin sản phẩm nào, trả về null để luồng article/generic xử lý
  if (!price && !byLine && !features && !desc) return null;

  let res = `[SẢN PHẨM AMAZON]: ${title}\n`;
  if (price) res += `• Giá: ${price}\n`;
  if (byLine) res += `• Tác giả / Thương hiệu: ${byLine}\n`;
  if (features) res += `• Tính năng nổi bật: ${features.substring(0, 1000)}\n`;
  if (desc) res += `• Mô tả: ${desc.substring(0, 1000)}\n`;
  return res.trim();
};

/**
 * Tải và trích xuất nội dung văn bản thuần từ một URL (Giả lập End-User request).
 * @param {string} url
 * @returns {Promise<string|null>}
 */
const scrapeUrl = async (url) => {
  if (url.includes("x.com/") || url.includes("twitter.com/")) {
    return "[Hệ thống: Hệ thống không hỗ trợ bot đọc link X/Twitter. Cần báo thành thật với User là không xem được link này.]";
  }

  try {
    const headRes = await axios.head(url, {
      headers: ENDUSER_BROWSER_HEADERS,
      timeout: 5000,
      maxRedirects: 5
    }).catch(() => null);

    let isPdf = url.toLowerCase().includes(".pdf");
    let contentLength = 0;

    if (headRes && headRes.headers) {
      if (headRes.headers["content-type"] && headRes.headers["content-type"].includes("application/pdf")) {
        isPdf = true;
      }
      contentLength = parseInt(headRes.headers["content-length"] || "0", 10);
    }

    if (isPdf) {
      if (contentLength > 5 * 1024 * 1024) {
        return "[Hệ thống: Link này chứa File PDF quá lớn (>5MB), không hỗ trợ phân tích để bảo vệ hệ thống]";
      }
      console.log(`[Scraper] Bắt đầu tải file PDF từ URL: ${url}`);
      const { data: pdfBuffer } = await axios.get(url, {
        headers: ENDUSER_BROWSER_HEADERS,
        responseType: "arraybuffer",
        timeout: 15000,
        maxRedirects: 5
      });
      if (pdfBuffer.length > 5 * 1024 * 1024) {
        return "[Hệ thống: File PDF tải về quá lớn (>5MB), không hỗ trợ phân tích]";
      }
      
      const fs = require("fs");
      const os = require("os");
      const path = require("path");
      const localPath = path.join(os.tmpdir(), `url_${Date.now()}.pdf`);
      fs.writeFileSync(localPath, pdfBuffer);
      
      const llm = require("./gemini");
      const fileDesc = await llm.analyzeDocument(localPath, true);
      return `[TÀI LIỆU PDF TRỪ URL]:\n"${fileDesc.trim()}"`;
    }

    const { data: html } = await axios.get(url, {
      headers: ENDUSER_BROWSER_HEADERS,
      timeout: 10000,
      maxRedirects: 5
    });
    if (typeof html !== "string") return null;

    // Nếu là link Amazon hoặc có cấu trúc sản phẩm Amazon
    if (/amazon\.[a-z.]+|\/dp\/|\/gp\/product\//i.test(url)) {
      const amazonText = parseAmazonHtml(html, url);
      if (amazonText) {
        console.log(`[Scraper] Trích xuất thành công thông tin sản phẩm Amazon trực tiếp.`);
        return amazonText;
      }
    }

    // Phát hiện trang chặn Captcha / Cloudflare / WAF / Akamai
    const isAntiBotBlocked = /validateCaptcha|Attention Required!|Cloudflare|Just a moment\.\.\.|Robot Check|automated access|triggerInterstitialChallenge|bm-verify/i.test(html);
    if (isAntiBotBlocked) {
      console.log(`[Scraper] Trang web bị chặn bởi Captcha/Anti-bot (${url}), chuyển sang fallback.`);
      return null;
    }

    // Ưu tiên trích xuất nội dung từ thẻ <article> hoặc <main> (cho blog, báo chí, tài liệu)
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
                         html.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
                         html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    const text = (articleMatch ? articleMatch[1] : html)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (text.length < 100) return null;

    return text.slice(0, 4000);
  } catch (error) {
    console.error("[Scraper] Lỗi đọc URL trực tiếp:", url, error.message);
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
    
    // Fallback 1: nếu scrape trực tiếp thất bại (Captcha/WAF), dùng Tavily Extract API (residential proxy + headless render)
    if (!urlText) {
      try {
        console.log(`[Scraper Fallback 1] Thử trích xuất qua Tavily Extract API: "${targetUrl}"`);
        urlText = await extractTavily(targetUrl);
      } catch (e) {
        console.error("[Scraper Fallback 1] Lỗi extractTavily:", e.message);
      }
    }

    // Fallback 2: nếu vẫn chưa có nội dung, tìm kiếm mở trên Web (Open Web Search qua Tavily)
    if (!urlText) {
      try {
        const cleanTargetUrl = targetUrl.split("?")[0].replace(/\/+$/, "");
        console.log(`[Scraper Fallback 2] Kích hoạt search theo URL trực tiếp: "${cleanTargetUrl}"`);
        let fallbackRes = await searchTavily(cleanTargetUrl, { include_answer: true, open_search: true });
        
        if (!fallbackRes || (!fallbackRes.answer && !fallbackRes.summary)) {
          // Thử trích xuất slug nếu search URL thuần không ra
          const parsed = new URL(targetUrl);
          const pathSlug = parsed.pathname
            .replace(/\.[a-zA-Z0-9]+$/, "")
            .replace(/[^a-zA-Z0-9\-_]/g, " ")
            .split(/[-_\s]+/)
            .filter(w => w.length >= 2 && isNaN(w))
            .join(" ");
          const domainName = parsed.hostname.replace("www.", "");
          if (pathSlug) {
            const fallbackQuery = `${pathSlug} ${domainName}`.trim();
            console.log(`[Scraper Fallback 2] Thử search theo slug URL: "${fallbackQuery}"`);
            fallbackRes = await searchTavily(fallbackQuery, { open_search: true });
          }
        }
        
        if (fallbackRes && (fallbackRes.answer || fallbackRes.summary)) {
          const info = fallbackRes.answer ? `${fallbackRes.answer}\n\n${fallbackRes.summary || ""}` : fallbackRes.summary;
          urlText = info.trim();
        }
      } catch (e) {
        console.error("[Scraper Fallback 2] Lỗi:", e.message);
      }
    }

    if (urlText) {
      console.log(`[Search Router] Đã trích xuất thành công nội dung URL (${urlText.length} ký tự).`);
      return {
        context: `\n\n[NỘI DUNG URL NGƯỜI DÙNG GỬI ĐẾN]:\n${urlText}\n`,
        urls: urls || []
      };
    }
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
    
    const botConfig = await getBotConfig();
    const cls = classifyQuery(finalQuery, botConfig.taxonomy);

    const { TODAY_KEYWORDS } = require("./tavily");
    const isWeatherQuery = /thời tiết|nhiệt độ|dự báo thời tiết|trời mưa|trời nắng/i.test(finalQuery);
    if (isWeatherQuery) {
      const hasLocation = /hà nội|hanoi|sài gòn|tp\.?hcm|hồ chí minh|đà nẵng|hải phòng|cần thơ|nha trang|huế|đà lạt|vũng tàu|quảng ninh|nghệ an|thanh hóa|bình dương|đồng nai|bắc bộ|nam bộ|trung bộ/i.test(finalQuery);
      if (!hasLocation) {
        finalQuery = `dự báo ${finalQuery} Hà Nội`;
      }
    }

    const isTodaySensitive = TODAY_KEYWORDS.some(kw => cleanQuery.toLowerCase().includes(kw));
    if (isTodaySensitive) {
      const todayStr = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
      finalQuery = `${finalQuery} ngày ${todayStr}`;
    } else if (cls.tavilyTopic === "news") {
      if (!/\b20\d{2}\b/.test(finalQuery)) {
        const currentYear = new Date().getFullYear();
        finalQuery = `${finalQuery} năm ${currentYear}`;
      }
    }

    console.log(`[Search Router] Kích hoạt tìm kiếm: "${finalQuery}" | Taxonomy: ${cls.domain} > ${cls.subTopic} (score=${cls.score}, route=${cls.route}, matched=[${cls.matchedConcepts.join(", ")}])`);
    
    try {
      if (cls.route === "EXA") {
        const res = await searchExa(finalQuery);
        if (res) { searchSummary = res.summary; searchUrls = res.urls; }
      } else {
        const res = await searchTavily(finalQuery, { topic: cls.tavilyTopic });
        if (res) { searchSummary = res.summary; searchUrls = res.urls; }
      }
    } catch (err) {
      console.log(`[Search Router] Nguồn chính (${cls.route}) lỗi, chạy fallback: ${err.message}`);
      try {
        if (cls.route === "EXA") {
          const res = await searchTavily(finalQuery, { topic: cls.tavilyTopic });
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
    const todayStr = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    internetContext = `\n\n[THÔNG TIN TỪ INTERNET (Thời gian thực: ${todayStr})]:\n${searchSummary}\n`;
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
