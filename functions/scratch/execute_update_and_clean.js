const admin = require("firebase-admin");
const path = require("path");

const lineKey = require(path.join(__dirname, "../auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json"));
const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");
const appLine = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");

function mergeRegexString(existingStr, newItems) {
  const currentList = (existingStr || "").split("|").map(s => s.trim().toLowerCase()).filter(Boolean);
  const set = new Set(currentList);
  
  for (const item of newItems) {
    const clean = item.trim().toLowerCase();
    if (clean && !set.has(clean)) {
      set.add(clean);
      currentList.push(clean);
    }
  }
  return currentList.join("|");
}

function mergeArray(existingArr, newItems) {
  const currentList = Array.isArray(existingArr) ? [...existingArr] : [];
  const set = new Set(currentList.map(s => (typeof s === "string" ? s.trim().toLowerCase() : s)));

  for (const item of newItems) {
    const clean = typeof item === "string" ? item.trim() : item;
    const cleanKey = typeof item === "string" ? item.trim().toLowerCase() : item;
    if (clean && !set.has(cleanKey)) {
      set.add(cleanKey);
      currentList.push(clean);
    }
  }
  return currentList;
}

async function execute() {
  const lineDb = appLine.firestore();
  const teleDb = appTele.firestore();

  // Data to merge
  const auditKeywordsByCategory = {
    DEV: [
      "ai", "vệ tinh", "llm", "generative", "agent", "agentic", "ai first",
      "gpt 6 astra", "mcp điều khiển phần mềm", "ai soạn lại", "antigravity",
      "nhạc ai", "antigravity token", "nghề code", "claude", "a.i", "s.a.a.s",
      "mcp", "ide a.i", "ltv"
    ],
    FINANCE: [
      "đất dân", "sun group", "35 triệu đồng", "thu tiền từ video",
      "gói 22usd antigravity", "chi phí token ai", "giải thể công ty",
      "phạt không đóng công ty", "thuế môn bài", "công ty ma", "tổng cục thuế",
      "chi cục thuế", "viosoft công ty nước ngoài", "lãi vay thả nổi 17%",
      "kinh tế vn", "kinh tế tư nhân", "kinh tế nhà nước", "giải thể doanh nghiệp",
      "bitcoin"
    ],
    NEWS: [
      "quốc phòng", "tập đoàn công nghiệp quốc phòng", "công an",
      "tai nạn giao thông", "tốc độ cao", "thủy kam", "tham ô", "hình sự"
    ],
    SOCIAL: [
      "gái miền tây", "lễ tang", "thứ trưởng", "bóc phốt", "tải clip tq về",
      "đẩy lên youtube kiếm tiền", "tiêu chí reup youtube", "20k follower youtube",
      "5k subscribe youtube", "mấy trăm clip view youtube", "xây kênh youtube",
      "clone video tq", "bộ máy nó có tâm hơn", "đế quốc", "thu thập thông tin cá nhân",
      "hội golf"
    ],
    GENERAL: [
      "hòa lạc", "metro", "đà nẵng", "quảng ninh", "luyện thép", "xưởng sản xuất",
      "tiếng anh", "tranh cãi", "vinasa", "vnpt", "tạo lập", "tạo sinh",
      "smart police", "đồ uống giảm cân", "dịch cabin", "dạy học sinh", "quy hoạch",
      "tàu điện ngầm", "bản quyền flappy bird", "thượng hải bắc kinh ô trấn",
      "kiếm đầu ra", "mc", "tầm sư học đạo", "kiến thức"
    ]
  };

  const newLinkPatterns = [
    "hội thảo nào của tq",
    "hội thảo của tq"
  ];

  const newTopics = [
    "luyện kim",
    "công nghệ hàng hải",
    "công nghiệp quốc phòng",
    "lãi suất",
    "kinh tế việt nam",
    "kiếm tiền online",
    "sáng tạo nội dung",
    "chính sách quản lý nhà nước việt nam và trung quốc",
    "du lịch trung quốc",
    "thủ tục giải thể doanh nghiệp",
    "quyền riêng tư dữ liệu"
  ];

  const newProactive = [
    "k muốn dồn effort",
    "thuê hẳn",
    "build sẵn lun",
    "ức chế vkl",
    "chỉ biết ước",
    "tìm mãi k thấy",
    "hy vọng kiên trì mà làm đc",
    "kiếm đc nguồn đầu ra ổn định",
    "nghề code giờ khó hơn rồi mà"
  ];

  const targets = [
    { name: "LINE", db: lineDb },
    { name: "TELEGRAM", db: teleDb }
  ];

  for (const { name, db } of targets) {
    console.log(`\nUpdating bot_config for ${name}...`);
    const docRef = db.collection("system_configs").doc("bot_config");
    const docSnap = await docRef.get();
    const currentData = docSnap.exists ? docSnap.data() : {};

    const currentSearchKeywords = currentData.search_keywords || {};
    const updatedSearchKeywords = { ...currentSearchKeywords };

    for (const [cat, kws] of Object.entries(auditKeywordsByCategory)) {
      updatedSearchKeywords[cat] = mergeRegexString(updatedSearchKeywords[cat], kws);
    }

    const updatedLinkRequests = mergeRegexString(currentData.link_requests_regex, newLinkPatterns);
    const updatedTopics = mergeArray(currentData.standalone_topics, newTopics);
    const updatedProactive = mergeArray(currentData.proactive_trigger_words, newProactive);

    const updatePayload = {
      ...currentData,
      search_keywords: updatedSearchKeywords,
      link_requests_regex: updatedLinkRequests,
      standalone_topics: updatedTopics,
      proactive_trigger_words: updatedProactive,
      updated_at: new Date()
    };

    await docRef.set(updatePayload, { merge: true });
    console.log(`Successfully updated bot_config for ${name}`);
  }

  // Cleanup LINE audit_logs (Inbox Zero)
  console.log("\nStarting Cleanup on LINE audit_logs...");
  const auditLogsSnap = await lineDb.collection("audit_logs").get();
  console.log(`Found ${auditLogsSnap.size} docs in LINE audit_logs`);

  for (const doc of auditLogsSnap.docs) {
    const data = doc.data();
    // Check if there are any remaining issues
    const hasUnresolvedIssues = data.audit_issues && Array.isArray(data.audit_issues) && data.audit_issues.length > 0;
    
    if (!hasUnresolvedIssues) {
      console.log(`Deleting processed doc ${doc.id}`);
      await doc.ref.delete();
    } else {
      console.log(`Updating doc ${doc.id} with FieldValue.delete()`);
      await doc.ref.update({
        audit_keywords: admin.firestore.FieldValue.delete(),
        missed_link_requests: admin.firestore.FieldValue.delete(),
        missed_topics: admin.firestore.FieldValue.delete(),
        missed_proactive_keywords: admin.firestore.FieldValue.delete(),
        suggested_stopwords: admin.firestore.FieldValue.delete()
      });
    }
  }

  // Check and cleanup TELEGRAM audit_logs if any
  const teleAuditSnap = await teleDb.collection("audit_logs").get();
  if (teleAuditSnap.size > 0) {
    console.log(`Found ${teleAuditSnap.size} docs in TELEGRAM audit_logs`);
    for (const doc of teleAuditSnap.docs) {
      await doc.ref.delete();
    }
  }

  console.log("\nUpdate & Cleanup completed successfully!");
}

execute().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
