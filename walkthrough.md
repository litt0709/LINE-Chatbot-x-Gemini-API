
## 3. Khắc phục lỗi Bot "Im lặng" khi gặp câu hỏi Thời sự trên Telegram/LINE

### Vấn đề:
Khi người dùng hỏi "Hôm nay có tin gì mới không?" hoặc các câu hỏi cần tìm kiếm trên Telegram, bot không trả lời. Nguyên nhân chính là do lời gọi API đến DeepSeek trong module `llm.chat` ném ra lỗi (do `503 Timeout` hoặc `400 Invalid Request`), nhưng khối xử lý Webhook của Telegram và LINE **không được bọc trong vòng `try...catch`**. Khi lỗi xảy ra, toàn bộ Cloud Function bị crash, khiến Webhook không trả về phản hồi cho người dùng.

### Giải pháp đã thực hiện:
- **Xử lý ngoại lệ trong Webhook**: Đã cập nhật tệp `functions/index.js`, bọc toàn bộ lời gọi `llm.chat(...)` trong khối `try...catch` cho cả Handler của Telegram và LINE.
- **Phản hồi dự phòng (Graceful Fallback)**: Nếu LLM gặp lỗi (ví dụ: quá tải, sai định dạng JSON), bot sẽ không im lặng mà tự động phản hồi lại người dùng: *"Dạ hiện tại máy chủ AI đang bận hoặc quá tải xíu, anh/chị đợi vài phút rồi hỏi lại em nha! 🥺"*, giúp giữ mạch giao tiếp liên tục.
- **Sửa lỗi Payload Tool Call DSML**: Đã vá tệp `functions/utils/deepseek.js` để tự động bổ sung `type: "function"` mỗi khi Regex fallback bắt được mã DSML trả về từ DeepSeek, đảm bảo đúng định dạng OpenAI API. Đồng thời thêm vòng lặp sanitize cuối cùng để quét mảng `messages`, loại bỏ triệt để mọi tin nhắn có `role: "model"` (tự ép về `"assistant"`) trước khi post payload sang DeepSeek.
