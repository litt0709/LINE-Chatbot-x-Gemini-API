const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

// Define webContext
content = content.replace(
    "// Xử lý chặn Hallucination & Tương tác lỗi bằng logic code (dynamic constraints)",
    "let webContext = \"\";\n  // Xử lý chặn Hallucination & Tương tác lỗi bằng logic code (dynamic constraints)"
);

// Remove the blocking return
const blockingBlock = `if (/(tin tức|bài báo|vụ án|sự kiện|xã hội|lỗi|sập|outage|bảo trì|fact check|kiểm chứng)/i.test(cleanPrompt) && !webContext) {
    console.log("[Code Logic] Chặn LLM do thiếu webContext cho câu hỏi thời sự");
    return "Dạ hiện tại em không tìm thấy thông tin chính xác trên mạng về vấn đề này ạ. Cần thêm từ khóa để em tra cứu lại nha 😔";
  }`;

content = content.replace(blockingBlock, `if (false) { }`);

fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
console.log("Crash fixed.");
