# Kế Hoạch: Nâng Cấp Nhận Diện Trọng Tâm Câu Hỏi & Cô Lập Phát Ngôn Khi Tổng Hợp (Targeted Speaker Isolation)

## 1. Bối cảnh & Các vấn đề cần giải quyết
1. **Bot trả lời lan man, chưa đúng trọng tâm:**
   - Trong System Prompt hiện tại, quy tắc xưng hô và phong cách (`brevityRule` khi chat 1-1 và `Style`) đang ép bot phải phân tích "CHI TIẾT, ĐA CHIỀU & CỐT LÕI" kèm "BẮT BUỘC dùng NHIỀU emoji 📊💡🌟 làm bullet points".
   - Hệ quả: Kể cả với các câu hỏi ngắn, câu hỏi dữ kiện đơn giản, bot cũng biến thành bài văn phân tích dài dòng, lan man, lạm dụng gạch đầu dòng và emoji, không đi thẳng vào câu trả lời cốt lõi.
2. **Tổng hợp nhầm thông tin của người khác khi được yêu cầu tổng hợp 1 người:**
   - Khi người dùng yêu cầu: *"Tổng hợp nội dung của anh Lâm"* hoặc *"Tóm tắt những gì tôi vừa chat"*, hệ thống nạp toàn bộ 150 tin nhắn của TẤT CẢ thành viên trong nhóm (User A, B, C, D) kèm cả tóm tắt lịch sử cũ của toàn nhóm (`filteredSummaries`).
   - Do cơ chế Attention của LLM, mô hình bị hòa trộn (blend) các ý kiến, dẫn đến việc lấy ý kiến của người khác (User B, User C) gán vào bản tóm tắt của người được yêu cầu (User A).

---

## 2. Giải pháp kỹ thuật thông minh

### A. Triệt tiêu lan man & Trả lời đúng trọng tâm (Laser-Focused Precision)
- Tinh chỉnh lại nguyên tắc trong `buildSystemPrompt` ([`functions/utils/deepseek.js`](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js)):
  - **Vào đề trực tiếp:** Trả lời thẳng vào nội dung câu hỏi ngay từ câu đầu tiên. CẤM mở bài sáo rỗng, CẤM chào hỏi lặp lại hay lan man sang các chủ đề không được hỏi.
  - **Tương xứng độ dài với câu hỏi:**
    - Câu hỏi dữ kiện / câu hỏi ngắn / thao tác: Trả lời ngắn gọn, chuẩn xác trong 1-3 câu hoặc 1 đoạn văn tự nhiên.
    - Câu hỏi tổng hợp / tóm tắt: Bám sát đúng đối tượng và ý chính, rành mạch.
    - CHỈ phân tích sâu, đa chiều khi người dùng có từ khóa yêu cầu rõ ràng (*"phân tích", "đánh giá chi tiết", "giải thích tại sao"*).
  - **Tinh tế trong trình bày:** Bỏ lệnh ép spam emoji; chỉ dùng bullet points khi liệt kê từ 3 điểm trở lên.

### B. Cơ chế Cô lập Phát ngôn theo Người (Speaker Isolation & Zero-Contamination Summarization)
- Xây dựng hàm nhận diện bằng code (chi phí $0 token):
  `extractTargetSpeaker(prompt, participants, currentSenderName, currentSenderId)`
  - Nhận diện các cấu trúc tổng hợp theo người:
    - *"tổng hợp/tóm tắt nội dung/ý kiến của [Tên]"*
    - *"[Tên] vừa nói gì / vừa chat gì / có ý kiến gì"*
    - *"tổng hợp những gì tôi / mình / em vừa nói"* (Tự động ánh xạ về chính người gửi `senderName`/`senderId`).
  - Chuẩn hóa Unicode và không dấu (`removeAccents`), phân biệt danh xưng ("anh Châu" là ngôi thứ 3, "tôi" là ngôi thứ nhất), lọc bỏ các stop words tập thể ("mọi người", "nhóm", "tất cả").
- **Xử lý dữ liệu đầu vào chuẩn xác (Ground Truth Data Feeding):**
  - Khi phát hiện yêu cầu tổng hợp 1 người cụ thể:
    1. Lọc từ `messagesArray` **chỉ lấy các tin nhắn do đúng người đó phát biểu**.
    2. Loại bỏ hoàn toàn `filteredSummaries` (tóm tắt cũ của cả nhóm) để chống nhiễm bẩn ngữ cảnh.
    3. Đóng gói danh sách tin nhắn độc quyền của người đó đưa vào Ground Truth block kèm chỉ thị nghiêm ngặt: CHỈ tóm tắt dựa trên các tin nhắn này, TUYỆT ĐỐI KHÔNG gán ý kiến của người khác vào.
    4. Nếu người đó chưa có tin nhắn nào trong lịch sử gần đây, báo lại thành thật, ngắn gọn ngay lập tức.
- **Tóm tắt toàn nhóm (Multi-Speaker Group Summary):**
  - Khi tổng hợp chung cả nhóm, kích hoạt nguyên tắc Attribution-First: Mỗi ý kiến phải gắn rõ tên người phát biểu (`• [Tên người]: [Ý kiến]`), không gán nhầm người.

### C. Đồng bộ tham số giữa các tầng xử lý
- Cập nhật hàm `chat` trong [`functions/utils/deepseek.js`](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js) để nhận `participants` từ Webhook handler ở [`functions/index.js`](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js) (cả LINE và Telegram).

---

## 3. Các bước triển khai
1. Cập nhật `functions/utils/deepseek.js`:
   - Thêm hàm `extractTargetSpeaker`.
   - Cập nhật hàm `chat` với logic Speaker Isolation.
   - Cập nhật `buildSystemPrompt` với quy tắc Laser-Focused Precision.
2. Cập nhật `functions/index.js`: Truyền `participants` vào lời gọi `llm.chat(...)` ở Telegram và LINE.
3. Kiểm thử cú pháp Node.js (`node -c`).
4. Chạy các kịch bản test giả lập để xác thực khả năng lọc tin nhắn và chống trả lời lan man.
5. Cập nhật tài liệu tính năng `docs/features.md`.
6. Báo cáo kết quả (không tự ý deploy).
