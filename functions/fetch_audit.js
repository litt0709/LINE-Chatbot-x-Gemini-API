const admin = require("firebase-admin");
const lineKey = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("./auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

// Initialize both Firebase projects
const lineApp = admin.initializeApp({ credential: admin.credential.cert(lineKey) }, "LINE_APP");
const teleApp = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP");

const dbLine = lineApp.firestore();
const dbTele = teleApp.firestore();

async function run() {
  console.log("Đang quét Audit Logs trên cả 2 nền tảng (LINE & TELEGRAM)...");
  
  const keywords = [];
  const issues = [];
  
  // 1. Quét LINE
  const snapLine = await dbLine.collection("audit_logs").get();
  if (!snapLine.empty) {
    snapLine.forEach(doc => {
      const data = doc.data();
      if (data.audit_keywords && Array.isArray(data.audit_keywords)) keywords.push(...data.audit_keywords);
      if (data.audit_issues && Array.isArray(data.audit_issues)) issues.push(...data.audit_issues);
    });
  }

  // 2. Quét TELEGRAM
  const snapTele = await dbTele.collection("audit_logs").get();
  if (!snapTele.empty) {
    snapTele.forEach(doc => {
      const data = doc.data();
      if (data.audit_keywords && Array.isArray(data.audit_keywords)) keywords.push(...data.audit_keywords);
      if (data.audit_issues && Array.isArray(data.audit_issues)) issues.push(...data.audit_issues);
    });
  }
  
  if (keywords.length === 0 && issues.length === 0) {
    console.log("Database hoàn toàn sạch sẽ! Không tìm thấy lỗi Ảo giác hay Từ khóa mới nào trên cả 2 nền tảng.");
    process.exit(0);
  }
  
  console.log("=== KẾT QUẢ AUDIT ===");
  if (keywords.length > 0) {
    console.log(">> TỪ KHÓA MỚI CẦN UPDATE:");
    console.log(JSON.stringify(keywords, null, 2));
  }
  if (issues.length > 0) {
    console.log(">> LỖI ẢO GIÁC (HALLUCINATION) CẦN FIX:");
    console.log(JSON.stringify(issues, null, 2));
  }
  
  process.exit(0);
}

run().catch(console.error);
