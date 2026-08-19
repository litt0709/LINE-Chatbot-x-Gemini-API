# Kế hoạch khắc phục lỗi Server AI Bận (Cold Start & Axios Stream Abort)

## 1. Vấn đề & Dữ liệu ghi nhận thực tế
- Khi khởi động Cold Start hoặc khi mạng chập chờn, người dùng đôi khi nhận được thông báo lỗi: *"Dạ hiện tại máy chủ AI đang bận hoặc quá tải xíu..."*.
- Nhật ký thực tế trong `logs/operational_logs` trên RTDB ghi nhận:
  - `errorType: "LLM_ERROR"`
  - `message: "aborted"`
  - `stack: Error: aborted at BrotliDecompress.handleStreamError`

---

## 2. Giải pháp kỹ thuật

### 1. Khử lỗi Stream Abort của Axios ([deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js))
- Bổ sung header `"Accept-Encoding": "gzip, deflate"` cho Axios request khi gọi DeepSeek API để tắt giải nén Brotli (`br`) vốn không ổn định trên Node.js stream và là nguồn gốc trực tiếp gây lỗi `aborted`.

### 2. Tối ưu Cold Start bằng Persistent HTTPS Keep-Alive Agent ([deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js))
- Khởi tạo `https.Agent` với `keepAlive: true`, `maxSockets: 50` và `keepAliveMsecs: 30000` dùng chung cho toàn bộ các lượt gọi DeepSeek.
- Giúp tái sử dụng socket, bỏ qua bước TLS Handshake lặp đi lặp lại, giảm độ trễ ~500ms - 1.5s mỗi request khi Cold Start.

### 3. Duy trì Model Series `deepseek-v4-flash` / `deepseek-v4-pro`
- Giữ nguyên cấu hình `deepseek-v4-flash` (System 1) và `deepseek-v4-pro` (System 2 cho câu hỏi phức tạp).

### 4. Cơ chế Fallback sang Gemini 2.5 Flash (Zero Downtime)
- Khi DeepSeek gặp sự cố mạng bất khả kháng (timeout / 5xx sau các lần retry), thay vì ném lỗi ra ngoài làm sập luồng, [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js) tự động chuyển sang gọi **Gemini 2.5 Flash** để sinh câu trả lời dự phòng.
- Người dùng luôn nhận được câu trả lời chất lượng cao ngay lập tức mà không bao giờ gặp câu báo lỗi bận mạng.
