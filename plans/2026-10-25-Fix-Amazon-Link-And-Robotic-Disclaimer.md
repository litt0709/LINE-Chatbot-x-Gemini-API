# Kế hoạch Triển khai: Sửa Lỗi Đọc Link Amazon & Loại Bỏ Lời Rào Đón Máy Móc Khi Đọc URL — 2026-10-25

## 1. Nguyên nhân Gốc rễ (Root Cause Analysis)

### Issue 1: Bot không đọc được link Amazon trong chat 1-1 với Eddy
1. **Thiếu kích hoạt `resolveWebContext` ở đầu luồng chat**:
   - Trong `functions/utils/deepseek.js` (hàm `chatWithHistory`), biến `let webContext = "";` được khai báo nhưng **không hề có đoạn code nào gọi `resolveWebContext(prompt)`** khi người dùng gửi tin nhắn chứa URL.
   - Vì `webContext` luôn rỗng `""`, bot hoàn toàn không có bất kỳ dữ liệu nào về trang web mà người dùng gửi.
2. **Cơ chế chống bot / Captcha của Amazon**:
   - Khi `scrapeUrl` gọi thẳng qua `axios.get()`, Amazon trả về trang mã Captcha (`validateCaptcha`) ngắn (~150 ký tự) thay vì nội dung sản phẩm.
   - `scrapeUrl` trước đây không nhận diện được trang Captcha, coi đó là nội dung thành công và trả về chuỗi Captcha vô nghĩa, khiến luồng Fallback Search không bao giờ được kích hoạt.
   - Thêm vào đó, nếu luồng trích xuất URL thất bại, logic `extractSearchQuery` kiểm tra thiếu danh từ riêng (`has_entity = false`) và xóa sạch ngữ cảnh web.

### Issue 2: Bot liên tục lặp lại câu máy móc "Nói thật em không truy cập vào link...", rào đón lằng nhằng
1. **Ép buộc rào đón từ guardrail động trong code**:
   - Tại dòng 397-400 trong `functions/utils/deepseek.js`, code đang cố tình nhồi vào prompt của người dùng câu lệnh ép buộc:
     > `BẮT BUỘC phải nói rõ với User là: "Em không xem trực tiếp được link này, nhưng em có tìm được thông tin trên mạng..."`
     > `BẮT BUỘC báo thành thật là không truy cập được link...`
   - Vì `webContext` bị rỗng ở Issue 1, 100% các tin nhắn có link đều bị nhồi chỉ thị này, khiến bot trở thành một cỗ máy liên tục phân trần, xin lỗi và giải thích kỹ thuật phiền toái.

---

## 2. Giải pháp Thông minh (Smart Fix Architecture)

### 1. Kích hoạt Trích xuất Link tự động & Nhận diện Anti-Bot (`search.js`)
- **Phát hiện Domain Anti-bot/E-commerce**: Với các trang web có cơ chế chặn scraper nghiêm ngặt (Amazon, Shopee, TikTok...), bỏ qua request trực tiếp dễ dính Captcha, chuyển thẳng sang **Fallback URL Search** qua Tavily.
- **Tối ưu Fallback URL Search**: Sử dụng chính URL của sản phẩm (đã làm sạch tham số theo dõi `?ref=...`) để tìm kiếm qua Tavily/Exa. Tavily tự động phân tích và trả về thông số sản phẩm, đánh giá, giá cả và mô tả chi tiết.
- **Bảo vệ Ngữ cảnh URL**: Khi đã có `urlText`, trả về ngay lập tức để tiết kiệm lượt gọi API search thừa và tránh bị chặn bởi bộ lọc danh từ riêng (`has_entity`).

### 2. Kích hoạt WebContext cho Tin nhắn Chứa Link (`deepseek.js`)
- Ngay khi phát hiện URL trong tin nhắn (`URL_REGEX.test(prompt)`), tự động gọi `resolveWebContext(prompt)` để nạp đầy đủ nội dung bài viết/sản phẩm vào `webContext` trước khi gọi DeepSeek.

### 3. Xóa bỏ Hoàn toàn Lời Rào đón Máy móc (Clean & Natural Human Persona)
- **Khi có thông tin URL**: Hướng dẫn bot trả lời thẳng vào nội dung/đánh giá sản phẩm/bài viết cho người dùng một cách tự nhiên, hữu ích. TUYỆT ĐỐI KHÔNG rào đón máy móc kiểu "em không xem trực tiếp được link", KHÔNG giải thích hạn chế kỹ thuật.
- **Khi link chết/hoàn toàn không có dữ liệu**: Phản hồi ngắn gọn, duyên dáng như một người bạn (ví dụ: *"Link này em chưa mở ra xem được chi tiết rồi anh ơi. Link này nói về chủ đề gì thế ạ, anh bảo em với em tìm hiểu thêm cho nha!"*), không văn mẫu, không ngụy biện.

---

## 3. Các bước Thực hiện

1. Sửa `functions/utils/search.js`:
   - Bổ sung nhận diện trang Anti-bot / Captcha trong `scrapeUrl`.
   - Cải tiến Fallback Search theo URL trực tiếp.
   - Trả về ngay `urlText` nếu đã trích xuất thành công.
2. Sửa `functions/utils/deepseek.js`:
   - Bổ sung gọi `resolveWebContext` khi prompt có URL.
   - Thay thế toàn bộ đoạn guardrail ép buộc rào đón máy móc ở dòng 393-401.
3. Kiểm thử với URL Amazon thực tế để xác nhận bot trả về đầy đủ thông tin sản phẩm và giọng điệu tự nhiên, không rào đón.
4. Cập nhật `docs/features.md`.
