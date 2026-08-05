function handleInfoCommand(prompt) {
  const isHelp = /^\/help$/i.test(prompt);
  
  if (isHelp) {
    return `🤖 **Danh sách các lệnh hệ thống (System Commands):**

📊 **/report**: Xem báo cáo chi phí và Token (DeepSeek) của Bot trong 7 ngày gần nhất.
🩺 **/health**: Xem báo cáo tổng quan về tình trạng sức khỏe của hệ thống (Runtime, Database, Agents, Memory).
ℹ️ **/about**: Thông tin về hệ thống và phiên bản Bot.
❓ **/help**: Hiển thị bảng hướng dẫn này.
🗑️ **/forget [id]**: Quên toàn bộ trí nhớ của 1 User hoặc Group cụ thể.

_Lưu ý: Các lệnh hệ thống được thực thi độc lập (Zero-cost) và không đi qua mô hình AI (LLM)._`;
  } else {
    // /about command
    return `ℹ️ **Thông tin hệ thống (About):**

- **Bot Identity**: Annie (Trợ lý thông minh)
- **Engine**: DeepSeek-V4 (Flash/Pro) kết hợp RAG Memory & Web Search
- **Architecture**: Modular Command Dispatcher + LLM Router
- **Runtime**: Node.js trên Firebase Cloud Functions (Serverless)
- **Database**: Firebase Realtime DB & Firestore

Hệ thống được thiết kế với tiêu chí Token Optimize, Cost Minimization & Zero-Hallucination. 🚀`;
  }
}

module.exports = {
  handleInfoCommand
};
