# Kế hoạch sửa lỗi tính năng Tự Học (Self-Learning & Evolution)

## 1. Hiện tượng & Vấn đề
- **Vấn đề 1:** Bot không có dữ liệu tự học nào trong suốt 7 ngày qua mặc dù Cron job 3:00 AM vẫn được kích hoạt mỗi đêm.
- **Vấn đề 2:** Khi người dùng hỏi trực tiếp trên LINE chat (`"em học được gì?"`, `"bot học được gì?"`), Bot hoàn toàn im lặng, không trả lời.

---

## 2. Nguyên nhân gốc rễ (Root Cause)

### Root Cause A: Lỗi `Cannot find module '../config'` và sai import trong [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js)
1. Dòng 3 của [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js):
   ```javascript
   const { DEEPSEEK_API_KEY, DEEPSEEK_URL, DEEPSEEK_MODEL } = require("../config");
   ```
   File `functions/config.js` **không tồn tại**. Node.js quăng lỗi `MODULE_NOT_FOUND` ngay khi cron job 3h sáng require file.
2. Dòng 4 của [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js):
   ```javascript
   const { resolveWebContext } = require("./deepseek");
   ```
   Hàm `resolveWebContext` nằm trong [search.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/search.js), không phải `deepseek.js`.
3. **Hậu quả:** Cron job 3h sáng kích hoạt hàm `runDailyEvolution` nhưng lập tức crash từ dòng require đầu tiên, dẫn đến cả 2 tiến trình `dailyHumanStudy` và `processAuditIssues` không bao giờ chạy thành công.

---

### Root Cause B: Sai tên hàm `line.replyMessage` trong [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js)
1. Dòng 1358 của [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js):
   ```javascript
   const learningReply = await learning.handleLearningRegex(messageContent);
   if (learningReply) {
     await line.replyMessage(event.replyToken, [{ type: "text", text: learningReply }]);
     continue;
   }
   ```
2. Module [line.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/line.js) chỉ xuất hàm `reply(...)`, hoàn toàn không có hàm `replyMessage(...)`.
3. **Hậu quả:** Khi người dùng hỏi *"em học được gì?"*, regex bắt được câu hỏi nhưng khi gọi `line.replyMessage` bị lỗi `TypeError: line.replyMessage is not a function`, làm sập luồng xử lý và bot không gửi được tin nhắn phản hồi.

---

## 3. Giải pháp khắc phục

1. **Sửa file [functions/utils/evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js):**
   - Đọc các biến môi trường trực tiếp từ `process.env` (hoặc fallback mặc định):
     ```javascript
     const DEEPSEEK_URL = process.env.DEEPSEEK_URL || "https://api.deepseek.com/chat/completions";
     const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
     const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
     ```
   - Import `resolveWebContext` đúng từ `./search`.

2. **Sửa file [functions/index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js):**
   - Đổi `line.replyMessage(event.replyToken, ...)` thành `line.reply(event.replyToken, ...)`.

3. **Kiểm thử (Verification):**
   - Chạy script test gọi thử `runDailyEvolution()` trong môi trường test để đảm bảo `dailyHumanStudy` và `processAuditIssues` chạy trơn tru, ghi nhận đúng log vào RTDB.
   - Chạy test regex và hàm `handleLearningRegex` để xác nhận output.
