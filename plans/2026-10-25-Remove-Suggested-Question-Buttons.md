# Kế Hoạch: Loại Bỏ Các Nút Câu Hỏi Tùy Chọn / Gợi Ý (Quick Reply & Inline Keyboard) Trên LINE và Telegram

## 1. Bối cảnh & Lý do thay đổi
- **Thực tế sử dụng:** Người dùng trên cả LINE và Telegram hầu như không click vào các nút câu hỏi tùy chọn (Quick Reply trên LINE / Inline Keyboard trên Telegram) mà bot tự động sinh ra khi làm rõ yêu cầu.
- **Trải nghiệm hội thoại (Persona):** Persona của bot là "Annie" - một cô gái người thật, tự nhiên, nữ tính. Việc liên tục đính kèm các nút bấm máy móc dưới mỗi câu trả lời làm mất đi tính tự nhiên và làm rối giao diện trò chuyện.
- **Tối ưu chi phí & Token:** Việc loại bỏ chỉ thị sinh thẻ `<Task mode="ASK" ...>` trong System Prompt giúp giảm bớt token đầu vào trên mỗi request gọi DeepSeek API, đồng thời giúp bot tập trung diễn đạt thắc mắc bằng câu chữ tự nhiên thay vì cố gắng format XML tags.

---

## 2. Các thành phần cần điều chỉnh

### A. System Prompt (`functions/utils/deepseek.js`)
- Xóa bỏ dòng chỉ thị:
  ```text
  - Hỏi lại: <Task mode="ASK" tags="Đáp án 1 | Đáp án 2" /> (tags=CÂU TRẢ LỜI, CẤM dùng câu hỏi)
  ```
- Bot sẽ tự nhiên đặt câu hỏi làm rõ trong văn bản phản hồi nếu thông tin của người dùng chưa đủ rõ ràng.

### B. LINE Message Builder (`functions/index.js`)
- Loại bỏ logic bóc tách thẻ `taskMatch` và khởi tạo đối tượng `quickReply`:
  - Bỏ biến `let quickReply = undefined;` và khối khởi tạo `quickReply = { items: ... }`.
  - Giữ lại regex dọn sạch thẻ rác `<Task[^>]*>` và `[TAGS:.*?\]` để tránh rò rỉ nếu mô hình có thói quen cũ sinh tag.
  - Bỏ `...(quickReply && { quickReply })` trong các trường hợp trả về tin nhắn (`text`, `textV2`).

### C. Telegram Message Sender (`functions/utils/telegram.js`)
- Loại bỏ logic bóc tách thẻ `taskMatch` tạo `reply_markup = { inline_keyboard: ... }`.
- Đảm bảo `rawText` vẫn được dọn sạch các thẻ `<Task...>` và `[TAGS:...]`.
- Giữ nguyên cơ chế nút inline cho các nghiệp vụ quản trị độc lập (như nút duyệt Admin Global Fact cho Eddy).

### D. Tài liệu tính năng (`docs/features.md`)
- Cập nhật mục 8 ("Làm rõ yêu cầu"): Ghi nhận việc chuyển đổi từ cơ chế nút bấm Quick Reply / Inline Keyboard sang cơ chế phản hồi văn bản tự nhiên theo phản hồi từ người dùng thực tế.

---

## 3. Kế hoạch kiểm thử (Verification)
1. Kiểm tra build và cú pháp JavaScript qua Node.js syntax check (`node -c`).
2. Chạy test giả lập tạo message cho cả LINE và Telegram để đảm bảo tin nhắn trả về thuần text sạch sẽ, không đính kèm quickReply / inline_keyboard gợi ý, và không bị lỗi cú pháp.
3. Không tự ý deploy cho tới khi có yêu cầu từ người dùng.
