const admin = require("firebase-admin");
const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config({ path: "./.env.tele-ai-chatbot" });

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

const removeAccents = (str) => {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
};

async function run() {
  console.log("=== BẮT ĐẦU CHẠY UPDATE LOGS ĐỘNG TỪ FIRESTORE ===");

  // 1. Tải logs
  const snapshot = await db.collection("audit_logs").get();
  if (snapshot.empty) {
    console.log("Không tìm thấy audit logs mới nào trên Firestore.");
    process.exit(0);
  }

  let allSuggestedStopwords = [];
  let allLeakQuestions = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.suggested_stopwords && Array.isArray(data.suggested_stopwords)) {
      allSuggestedStopwords.push(...data.suggested_stopwords);
    }
    if (data.audit_issues && Array.isArray(data.audit_issues)) {
      data.audit_issues.forEach(issue => {
        if (issue.issue_type === "prompt_leakage" && issue.user_question) {
          allLeakQuestions.push(issue.user_question);
        }
      });
    }
  });

  console.log(`Đã trích xuất ${allSuggestedStopwords.length} đề xuất stopword và ${allLeakQuestions.length} câu hỏi gài bẫy prompt.`);

  // 2. Cập nhật stopwords.json
  const stopwordsPath = path.join(__dirname, "utils", "stopwords.json");
  let existingStopwords = [];
  if (fs.existsSync(stopwordsPath)) {
    existingStopwords = JSON.parse(fs.readFileSync(stopwordsPath, "utf8"));
  }

  let updatedStopwordsCount = 0;
  allSuggestedStopwords.forEach(sw => {
    const cleanSw = removeAccents(sw.toLowerCase().trim());
    if (cleanSw && !existingStopwords.includes(cleanSw)) {
      existingStopwords.push(cleanSw);
      updatedStopwordsCount++;
    }
  });

  if (updatedStopwordsCount > 0) {
    fs.writeFileSync(stopwordsPath, JSON.stringify(existingStopwords, null, 2), "utf8");
    console.log(`✅ Đã thêm ${updatedStopwordsCount} stopword mới vào stopwords.json.`);
  } else {
    console.log("Không có stopword mới nào được thêm (trùng lặp hoặc rỗng).");
  }

  // 3. Cập nhật leak_blacklist.json
  const blacklistPath = path.join(__dirname, "utils", "leak_blacklist.json");
  let existingBlacklist = [];
  if (fs.existsSync(blacklistPath)) {
    existingBlacklist = JSON.parse(fs.readFileSync(blacklistPath, "utf8"));
  }

  let updatedBlacklistCount = 0;
  allLeakQuestions.forEach(q => {
    const cleanQ = removeAccents(q.toLowerCase().trim());
    if (cleanQ && !existingBlacklist.includes(cleanQ)) {
      existingBlacklist.push(cleanQ);
      updatedBlacklistCount++;
    }
  });

  if (updatedBlacklistCount > 0) {
    fs.writeFileSync(blacklistPath, JSON.stringify(existingBlacklist, null, 2), "utf8");
    console.log(`✅ Đã thêm ${updatedBlacklistCount} câu hỏi gài bẫy mới vào leak_blacklist.json.`);
  } else {
    console.log("Không có câu hỏi gài bẫy mới nào được thêm.");
  }

  console.log("=== HOÀN TẤT QUÁ TRÌNH UPDATE ===");
  process.exit(0);
}

run().catch(console.error);
