const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccountPath = path.join(__dirname, "../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require(serviceAccountPath))
  });
}

const db = admin.firestore();

async function fetchUpdateData() {
  const result = {
    audit_keywords: [],
    missed_link_requests: [],
    missed_topics: [],
    missed_entities: [],
    missed_proactive_keywords: [],
    prompt_leakage_questions: []
  };
  
  try {
    const logsRef = db.collection("audit_logs");
    const snapshot = await logsRef.get();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      
      if (data.audit_keywords && Array.isArray(data.audit_keywords)) {
        result.audit_keywords.push(...data.audit_keywords);
      }
      
      if (data.missed_link_requests && Array.isArray(data.missed_link_requests)) {
        result.missed_link_requests.push(...data.missed_link_requests);
      }
      
      if (data.missed_topics && Array.isArray(data.missed_topics)) {
        result.missed_topics.push(...data.missed_topics);
      }
      
      if (data.missed_entities && Array.isArray(data.missed_entities)) {
        result.missed_entities.push(...data.missed_entities);
      }
      
      if (data.missed_proactive_keywords && Array.isArray(data.missed_proactive_keywords)) {
        result.missed_proactive_keywords.push(...data.missed_proactive_keywords);
      }
      
      if (data.audit_issues && Array.isArray(data.audit_issues)) {
        data.audit_issues.forEach(issue => {
          if (issue.issue_type === "prompt_leakage" && issue.user_question) {
            result.prompt_leakage_questions.push(issue.user_question);
          }
        });
      }
    });
    
    fs.writeFileSync(path.join(__dirname, "update_data.json"), JSON.stringify(result, null, 2));
    console.log("Dữ liệu update đã được lưu tại scratch/update_data.json");
    
    console.log("\n=== TÓM TẮT DỮ LIỆU CẦN UPDATE ===");
    console.log(`- audit_keywords: ${result.audit_keywords.length}`);
    console.log(`- missed_link_requests: ${result.missed_link_requests.length}`);
    console.log(`- missed_topics: ${result.missed_topics.length}`);
    console.log(`- missed_entities: ${result.missed_entities.length}`);
    console.log(`- missed_proactive_keywords: ${result.missed_proactive_keywords.length}`);
    console.log(`- prompt_leakage_questions: ${result.prompt_leakage_questions.length}`);
    
  } catch (error) {
    console.error("Lỗi khi lấy dữ liệu update:", error);
  }
}

fetchUpdateData();
