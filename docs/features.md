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
- **Tính bền bỉ (Idempotency):** Áp dụng cờ trạng thái (State Flag) lưu trên RTDB để chống tình trạng lỡ tin nhắn do Cloud Scheduler bị độ trễ (delay cold-start) vượt quá số phút quy định. Mở rộng khung cửa sổ kích hoạt kết hợp với RTDB giúp đảm bảo bản tin được phát đi duy nhất một lần (Exactly-Once delivery).

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

## 12. Báo Cáo Sức Khỏe & Quản Lý Lệnh Hệ Thống (Modular Commands)
- **Modular Command Dispatcher**: Tách biệt logic xử lý các lệnh hệ thống (như `/vẽ`, `/report`, `/health`) ra khỏi luồng xử lý NLP/LLM chính.
- **System Health Report (`/health`)**: Cung cấp báo cáo thời gian thực về sức khỏe của Runtime Node.js, trạng thái DB (ping latency), các Agents đang chạy, và các tác vụ ngầm (Cron Jobs).

## 13. Báo cáo Tự Học (Self-Learning Report)
- **Cơ chế:** Hệ thống tự động ghi nhận lại những kiến thức bot học được từ cộng đồng (Facts) và từ quá trình tự học lúc 3h sáng (Tầm sư học đạo, Tự kiểm điểm lỗi).
- **Cách hoạt động:** Dữ liệu học hỏi được lưu tập trung vào RTDB (`logs/system_logs`). Người dùng có thể yêu cầu bot báo cáo lại những gì đã học trong 3-7 ngày qua thông qua lệnh trực tiếp `/learning` hoặc qua chat tự nhiên (VD: "mày học được gì?"). Dữ liệu cũ hơn 7 ngày tự động bị dọn dẹp để tiết kiệm không gian.

## 14. Tìm kiếm & Trích xuất Web Thông Minh (Smart Web Search & Scraping Fallback)
- **Cơ chế:** Bot tự động trích xuất nội dung từ các đường link URL người dùng gửi (hỗ trợ cả HTML và PDF), đồng thời tìm kiếm dữ liệu thời gian thực qua Tavily/Exa.
- **Cơ chế Fallback & Tên miền động:** Khi trang báo/web chặn scraping (WAF/Cloudflare), hệ thống tự động bóc tách slug bài viết và tên miền từ URL để search internet thay thế mà không báo lỗi cụt. Hệ thống tự động trích xuất các domain chỉ định trong query (VD: `techcrunch.com`, `theverge.com`...) để mở rộng phạm vi tìm kiếm nguồn tin chính xác.

## 15. Quản lý Hồ sơ Người dùng Chuẩn hóa (Canonical User Profile & Platform Isolation)
- **Cơ chế:** Mỗi người dùng trên một nền tảng (LINE / Telegram) chỉ sở hữu duy nhất một hồ sơ cá nhân trên Firestore, được định danh theo đúng Canonical Platform ID (LINE ID `U...` hoặc Telegram numeric ID).
- **Phân giải & Bảo vệ:** Hệ thống tự động phân giải tên/nickname trong nhóm qua bảng map `participants` về Canonical ID thực tế. Chặn đứng việc tạo document rác mang tên riêng (như "Châu", "Acatms") và lọc bỏ các danh từ ghép phổ biến ("Châu Á", "Châu Âu", "Hải sản"...) để tránh nhận diện nhầm tên riêng của người dùng.

## 16. Bugfix: Brotli Encoding (Accept-Encoding Header) — 2026-08-19
- **Vấn đề:** Bot báo "máy chủ AI đang bận" ngẫu nhiên tại cả nhóm LINE và Telegram DCL. Root cause: DeepSeek server trả response nén bằng **Brotli (`br`)** khi response dài (câu hỏi phức tạp / deepseek-v4-pro), nhưng Axios chỉ khai báo `Accept-Encoding: gzip, deflate` → Node.js `BrotliDecompress` stream lỗi → `Error: aborted` → bot báo bận.
- **Fix:** Thêm `br` vào header trong `utils/deepseek.js`: `"Accept-Encoding": "gzip, deflate, br"`. Fix 1 dòng, không thay đổi logic, không chỉnh System Prompt.
- **Điều kiện xảy ra:** Chỉ xảy ra với câu hỏi phức tạp (trigger Dual-Process Classifier → deepseek-v4-pro) tạo ra response dài → server tự động chọn Brotli để nén hiệu quả hơn.

## 17. Tối ưu Chi phí: Chuyển đổi Model sang deepseek-chat & Tạm dừng deepseek-v4-pro — 2026-08-24
- **Cơ chế:** Để tối ưu chi phí vận hành (Cost Minimization), toàn bộ hệ thống chuyển đổi default LLM sang `deepseek-chat` (DeepSeek-V3).
- **Tạm dừng System 2 (v4-pro):** Tạm thời vô hiệu hóa việc chuyển hướng sang `deepseek-v4-pro` đối với các câu hỏi phân tích/phức tạp/code, tất cả các câu hỏi được xử lý đồng nhất qua `deepseek-chat` với cơ chế ReAct Tool Calling & Gemini Fallback.
- **Tính toán chi phí:** Bổ sung mức giá của `deepseek-chat` vào công cụ thống kê (`/report`) với giá $0.27/1M input tokens và $1.10/1M output tokens.

## 18. Chuẩn hóa Tên thật Hồ sơ & Tối ưu Tra cứu Thời tiết (Profile Name Priority & Weather Search) — 2026-08-26
- **Ưu tiên Tên thật (Real Name Priority):** Hệ thống và System Prompt ưu tiên sử dụng tên thật (`real_name` / `name`) trong hồ sơ người dùng để xưng hô tự nhiên (ví dụ: "anh Trịnh" thay vì "anh TrinhNX", "anh Lâm" thay vì "anh litt0709" hay "anh Eddy", "anh Du" thay vì "anh badpaybad"). Tuyệt đối tránh xưng hô bằng nickname kỹ thuật có chứa đuôi viết tắt hoặc ID.
- **Bảo vệ Profile trong Group Chat (Group Profile Guard):** Ngăn chặn việc bot tự động ghi đè trường `real_name` của người gửi khi trò chuyện trong group chat nếu thiếu `userId` rõ ràng hoặc chỉ đang nhắc đến tên thành viên khác.
- **Tối ưu Tìm kiếm Thời tiết (Smart Weather Search):**
  - Mở rộng phạm vi tìm kiếm sang các trang khí tượng / dự báo thời tiết chuyên dụng (`nchmf.gov.vn`, `dubaothoitiet.edu.vn`, `accuweather.com`, `weather.com`, `vtcnews.vn`...).
  - Loại bỏ giới hạn `time_range: "day"` đối với intent thời tiết để không bỏ lỡ các bản tin dự báo được phát hành từ chiều/tối hôm trước.
  - Tự động bổ sung địa danh mặc định (Hà Nội) khi người dùng hỏi thời tiết chung chung không kèm tên tỉnh/thành phố, đảm bảo bot luôn trả về thông tin thời tiết chính xác, đầy đủ nhiệt độ mà không bị hiện tượng "không tìm thấy dữ liệu".

