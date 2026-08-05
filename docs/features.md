# Các tính năng của Bot (Features)

Tài liệu này liệt kê danh sách các tính năng (features) của Bot, bao gồm tên gọi, cơ chế hoạt động, và cấu hình hiện tại để tiện cho quá trình theo dõi, nâng cấp.

## 1. Nghe lén (Proactive Intervention)
- **Cơ chế:** Khi mọi người đang chat bình thường trong group (không tag bot), bot sẽ lưu vào background history. Nếu câu chat chứa các Trigger Words biểu hiện sự bế tắc hoặc cần trợ giúp (VD: *"ai biết", "làm sao", "lỗi gì", "bug", "không chạy", "có cách nào", "bác nào", "mọi người"*), bot sẽ tự động phân tích và quyết định có nhảy vào hỗ trợ hay không.
- **System Prompt đặc biệt:** *"Bạn đang nghe lén. User không gọi bạn. Chỉ nhảy vào nếu họ đang bí ý tưởng hoặc tranh luận kỹ thuật mà bạn biết chắc giải pháp. Nếu chỉ là tán gẫu, bắt buộc trả về IGNORE."*
- **Giới hạn tần suất:** Tối đa 1 lần mỗi 60 phút cho mỗi group (Sử dụng Cache RAM để lưu `lastProactiveTime`).

## 2. Bám sát hội thoại (Focus Mode)
- **Cơ chế:** Khi bot vừa tương tác với một người dùng trong group, bot sẽ vào trạng thái "Tập trung" vào user đó trong vòng 3 phút.
- **Cách hoạt động:** Nếu user đó nhắn tiếp một câu (không chứa tag bot khác), bot sẽ tự động xem xét câu đó như đang nói chuyện với mình. Nếu nội dung chỉ là nói chuyện với người khác, LLM sẽ xuất `IGNORE` và tự ngắt Focus Mode.

## 3. Bản tin hàng ngày (Daily News Digest)
- **Cơ chế:** Hàng ngày vào lúc 8:00 sáng và 13:30 chiều (từ Thứ 2 đến Thứ 6), bot sẽ tự động gửi bản tin công nghệ mới nhất hoặc câu chúc ngày mới vào các group/user đã đăng ký nhận thông báo.
- **Luồng xử lý:** Sử dụng Firebase Cloud Scheduler để trigger hàm cron job tự động.

## 4. Quản lý Hồ sơ (Profile Management)
- **Cơ chế:** Bot tự động trích xuất các đặc điểm cá nhân, sở thích, giới tính, tên gọi của user thông qua thẻ XML `<PROFILE>`. 
- **Cách hoạt động:** Dữ liệu này được lưu trực tiếp vào Firestore và tự động gọi ra nhúng vào Context cho các lần chat sau, giúp LLM có khả năng xưng hô và cá nhân hóa chính xác tuyệt đối.

## 5. Học hỏi kiến thức (Fact Learning)
- **Cơ chế:** Bot có khả năng ghi nhớ các kiến thức kỹ thuật, hoặc thông tin chung mà người dùng dạy cho nó (thông qua thẻ `<FACT>`). 
- **Cách hoạt động:** Facts được lưu vào RTDB, với Index lưu tách biệt. Khi User chat có từ khóa liên quan, hệ thống tự động bốc Facts đó tiêm vào ngữ cảnh (Context) trước khi gọi LLM. Có hỗ trợ gửi duyệt Admin (qua Telegram) đối với Global Fact.

## 6. Thả cảm xúc tự động (React Emoji)
- **Cơ chế:** Bot có thể thể hiện cảm xúc giống con người bằng cách thả react (haha, thả tim, ngạc nhiên, v.v.) trực tiếp lên tin nhắn của người dùng.
- **Cách hoạt động:** Khi LLM sinh ra thẻ `<REACT emoji="..." />`, hệ thống sẽ gọi API của Telegram (`setMessageReaction`) để gán emoji đó lên chính xác tin nhắn vừa nhận. (Hiện tại tính năng này được hỗ trợ tối ưu trên Telegram).

## 7. Đặt lịch nhắc nhở (Reminders & Scheduler)
- **Cơ chế:** Người dùng có thể nhờ bot nhắc nhở một việc gì đó vào một thời điểm cụ thể trong tương lai (Ví dụ: "Nhắc tôi uống nước sau 5 phút nữa").
- **Cách hoạt động:** LLM xuất ra thẻ `<SCHEDULE action="ADD" time="..." prompt="..." />`. Dữ liệu được lưu vào Database. Có một worker chạy ngầm mỗi phút để quét các lịch đến hạn và gửi thông báo nhắc nhở trực tiếp cho user.

## 8. Làm rõ yêu cầu (Smart Clarification / Quick Replies)
- **Cơ chế:** Khi người dùng đặt câu hỏi quá chung chung, mơ hồ hoặc thiếu bối cảnh, thay vì trả lời dài dòng hoặc đoán mò, bot sẽ chủ động hỏi lại và đưa ra các tùy chọn gợi ý.
- **Cách hoạt động:** LLM sinh ra thẻ `<Task mode="ASK" tags="Lựa chọn A | Lựa chọn B" />`. Hệ thống sẽ dịch thẻ này thành các nút bấm `Quick Reply` (trên LINE) hoặc `Inline Keyboard` (trên Telegram) để người dùng chỉ cần bấm chọn thay vì phải gõ phím.

## 9. Đọc hiểu hình ảnh (Multimodal Vision)
- **Cơ chế:** Bot có khả năng "nhìn" và phân tích hình ảnh do người dùng gửi tới.
- **Cách hoạt động:** Nhận diện và trích xuất nội dung từ ảnh (Image to Text) thông qua model Vision. Đối với Telegram, hệ thống còn hỗ trợ Lazy Image (lưu ảnh ẩn danh nếu không có caption) và chỉ phân tích khi người dùng bắt đầu đặt câu hỏi liên quan đến bức ảnh.

## 10. Tóm tắt & Quản lý Chủ đề (Topic Summarization)
- **Cơ chế:** Quản lý dung lượng bộ nhớ (Context Window) bằng cách tự động hoặc chủ động tóm tắt các đoạn hội thoại dài.
- **Cách hoạt động:** Khi user gõ lệnh `"tóm tắt chủ đề"` hoặc khi bộ nhớ đầy, hệ thống sẽ chốt lại các điểm chính của cuộc trò chuyện, lưu thành `Hot Topic` để duy trì mạch truyện, đồng thời giải phóng bộ nhớ RAM tạm thời nhằm tiết kiệm token xử lý.

## 11. Báo cáo Chi phí & Tiêu thụ Token (Cost Reporting)
- **Cơ chế:** Theo dõi và thống kê số lượng token mà LLM (DeepSeek) tiêu thụ hàng ngày, từ đó ước tính chi phí thực tế theo USD.
- **Cách hoạt động:** Sau mỗi lượt chat, bot trích xuất dữ liệu `usage` từ API và lưu dồn (atomic increment) vào RTDB (`metrics/daily_tokens`). Người quản trị có thể gọi công cụ IDE Agent (Skill `/report`) để xuất báo cáo chi tiết mà không làm ảnh hưởng đến hiệu năng hay phát sinh chi phí Write của hệ thống.
