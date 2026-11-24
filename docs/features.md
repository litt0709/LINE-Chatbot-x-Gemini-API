# Các tính năng của Bot (Features)

Tài liệu này liệt kê danh sách các tính năng (features) của Bot, bao gồm tên gọi, cơ chế hoạt động, và cấu hình hiện tại để tiện cho quá trình theo dõi, nâng cấp.

## 1. Nghe lén (Proactive Intervention)
- **Cơ chế:** Khi mọi người đang chat bình thường trong group (không tag bot), bot sẽ lưu vào background history. Nếu câu chat chứa các Trigger Words biểu hiện sự bế tắc hoặc cần trợ giúp (VD: *"ai biết", "làm sao", "lỗi gì", "bug", "không chạy", "có cách nào", "bác nào", "mọi người"*), bot sẽ tự động phân tích và quyết định có nhảy vào hỗ trợ hay không.
- **System Prompt đặc biệt:** *"Bạn đang nghe lén. User không gọi bạn. Chỉ nhảy vào nếu họ đang bí ý tưởng hoặc tranh luận kỹ thuật mà bạn biết chắc giải pháp. Nếu chỉ là tán gẫu, bắt buộc trả về IGNORE."*
- **Giới hạn tần suất:** Tối đa 1 lần mỗi 60 phút cho mỗi group (Sử dụng Cache RAM để lưu `lastProactiveTime`).

## 2. Bám sát hội thoại (Focus Mode)
- **Cơ chế:** Khi bot vừa tương tác với một người dùng trong group, bot sẽ vào trạng thái "Tập trung" vào user đó trong vòng 3 phút.
- **Cách hoạt động:** Nếu user đó nhắn tiếp một câu dạng văn bản (không chứa tag bot khác và khớp mẫu câu hỏi/yêu cầu `QUESTION_OR_COMMAND_REGEX`), bot sẽ tự động xem xét câu đó như đang nói chuyện với mình. Nếu nội dung chỉ là nói chuyện với người khác, LLM sẽ xuất `IGNORE` và tự ngắt Focus Mode.
- **Quy tắc Sticker & Media:** Sticker hoặc hình ảnh/tài liệu gửi thuần không kèm lời gọi bot trong group chat sẽ **tuyệt đối không kích hoạt Focus Mode hay Proactive Intervention** (chỉ lưu vào background history) nhằm tránh kích hoạt bot nhầm lẫn và tối ưu 100% chi phí token.

## 3. Bản tin hàng ngày (Daily News Digest) *(Tạm thời disabled)*
- **Trạng thái:** Tạm thời vô hiệu hóa (`ENABLE_NEWS = false` trong `functions/index.js`) để tối ưu hóa tài nguyên vận hành.
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

## 8. Làm rõ yêu cầu bằng hội thoại tự nhiên (Conversational Clarification)
- **Cơ chế:** Khi người dùng đặt câu hỏi quá chung chung, mơ hồ hoặc thiếu bối cảnh, bot chủ động đặt câu hỏi làm rõ trực tiếp bằng lời thoại tự nhiên (như một người thật), thay vì đoán mò hoặc ép hiển thị các nút bấm máy móc.
- **Tiến hóa thiết kế:** Trước đây hệ thống dùng thẻ `<Task mode="ASK" tags="..." />` để tạo nút `Quick Reply` (LINE) hoặc `Inline Keyboard` (Telegram). Qua phân tích thực tế, người dùng rất ít click nút và các nút này làm giao diện bị rối mắt, giảm tính tự nhiên của persona Annie. Do đó hệ thống đã tinh gọn bằng cách loại bỏ các nút bấm tùy chọn này, bot sẽ hỏi lại tự nhiên qua text để giữ trải nghiệm mượt mà và tối ưu chi phí token.

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

## 18. Chuẩn hóa Tên thật Hồ sơ & Tối ưu Tra cứu Thời tiết, Ngữ cảnh nối tiếp (Profile Name Priority, Weather & Follow-up Context) — 2026-08-26
- **Ưu tiên Tên thật (Real Name Priority):** Hệ thống và System Prompt ưu tiên sử dụng tên thật (`real_name` / `name`) trong hồ sơ người dùng để xưng hô tự nhiên (ví dụ: "anh Trịnh" thay vì "anh TrinhNX", "anh Lâm" thay vì "anh litt0709" hay "anh Eddy", "anh Du" thay vì "anh badpaybad"). Tuyệt đối tránh xưng hô bằng nickname kỹ thuật có chứa đuôi viết tắt hoặc ID.
- **Bảo vệ Profile trong Group Chat (Group Profile Guard):** Ngăn chặn việc bot tự động ghi đè trường `real_name` của người gửi khi trò chuyện trong group chat nếu thiếu `userId` rõ ràng hoặc chỉ đang nhắc đến tên thành viên khác.
- **Tối ưu Tìm kiếm Thời tiết (Smart Weather Search):**
  - Mở rộng phạm vi tìm kiếm sang các trang khí tượng / dự báo thời tiết chuyên dụng (`nchmf.gov.vn`, `dubaothoitiet.edu.vn`, `accuweather.com`, `weather.com`, `vtcnews.vn`...).
  - Loại bỏ giới hạn `time_range: "day"` đối với intent thời tiết để không bỏ lỡ các bản tin dự báo được phát hành từ chiều/tối hôm trước.
  - Tự động bổ sung địa danh mặc định (Hà Nội) khi người dùng hỏi thời tiết chung chung không kèm tên tỉnh/thành phố, đảm bảo bot luôn trả về thông tin thời tiết chính xác, đầy đủ nhiệt độ mà không bị hiện tượng "không tìm thấy dữ liệu".
- **Xử lý Tham chiếu Ngữ cảnh Nối tiếp (Contextual Follow-up Query Resolution):** Khi người dùng trong nhóm chat hỏi câu nối tiếp (ví dụ: *"theo tin mới nhất được phát hành tiếp"*, *"vụ này sao rồi"*), Bot tự động liên hệ với chủ đề/thực thể vừa thảo luận trong lịch sử (như truyện Cổ Chân Nhân) và ghép vào query tìm kiếm (`google_search`) để kiểm chứng ngay lập tức, không hỏi lại người dùng xin link hay tiêu đề một cách máy móc.

## 19. Thư viện Tri thức Triết lý Giao tiếp Động (Dynamic RAG Human Insights) — 2026-08-26
- **Tích trữ Không giới hạn (Unlimited Knowledge Library):** Loại bỏ giới hạn nén/cắt tối đa 5 mục trong `dailyHumanStudy()`. Các bài học tâm lý và triết lý giao tiếp học được lúc 3h sáng được lưu trữ vĩnh viễn dưới dạng cấu trúc có `topic`, `insight`, và danh sách từ khóa cảm xúc `triggers`.
- **Rút xuất Động theo Ngữ cảnh (Context-Aware Injection):** 
  - Hàm `matchRelevantInsight(prompt, humanInsights)` tự động quét cảm xúc người dùng (buồn, giận, thất bại, từ chối, đùa vui...).
  - Chỉ tiêm đúng **1 triết lý đắc địa nhất** vào System Prompt khi có tình huống cảm xúc tương ứng.
  - Khi người dùng hỏi các câu hỏi thông thường (thời tiết, giá vàng, code, bóng đá...), không tiêm triết lý để **tiết kiệm 100% token** và giữ Context Window sạch sẽ.
## 20. Khắc phục Cảm xúc Quá đà & Nhận diện Tìm kiếm Website Tin đồn — 2026-10-07
- **Mở rộng EQ Empathy (`analyzeEmotion`):**
  - Mở rộng regex offline ($0 compute) để nhận diện các trạng thái cảm xúc tiêu cực/tổn thương từ sticker LINE (`depressed`, `stunned`, `knocked out`, `annoyed`, `sulking`, `hurt`, `sad`, `upset`) và tiếng lóng tiếng Việt (`tủi thân`, `dỗi`, `tự ái`, `bày trò`, `quá đà`, `chua chát`, `cay cú`).
  - Thiết lập ranh giới cứng (Firm Boundary) trong System Prompt: TUYỆT ĐỐI KHÔNG tiếp tay trêu chọc hoặc đặt biệt danh mỉa mai khi đối phương khó chịu hoặc đùa quá trớn, buộc bot phải chủ động dừng và hòa giải.
- **Tối ưu Search Router & Nhận diện Domain (`search.js`):**
  - Bổ sung nhận diện tên miền web độc lập (`DOMAIN_REGEX` cho `.com`, `.vn`, `.cn`, `.net`, `.org`...) và các từ khóa xác minh (`kiểm tra`, `check`, `xác minh`, `xác thực`, `tin đồn`, `vụ này`) vào `checkNeedsSearch` để không bỏ sót các câu hỏi fact-check.
## 21. Khắc phục Rò rỉ DSML, Typing Ảo Telegram, và Nhận diện Thứ Trong Tuần — 2026-10-07
- **Bóc tách DSML Tool Calls & Chống rò rỉ mã thẻ (`deepseek.js`):**
  - Mở rộng regex bóc tách toàn diện mọi biến thể định dạng DSML (DeepSeek Markup Language) gồm `<｜｜DSML｜｜ calls>`, `<｜｜DSML｜｜tool_calls>`, các thuộc tính `string="true"` và khoảng trắng thẻ đóng.
  - Tự động chuyển đổi các thẻ DSML thô thành `tool_calls` để kích hoạt `google_search` bình thường.
  - Bộ lọc triệt để chống rò rỉ: Loại bỏ 100% thẻ DSML còn sót lại khỏi câu trả lời của người dùng. Nếu nội dung chỉ chứa DSML rác, tự động retry LLM trực tiếp bằng tiếng Việt.
- **Triệt tiêu Typing Ảo trên Telegram (`index.js`):**
  - Điều kiện hóa lệnh `sendChatAction(chatId, "typing")`: Chỉ gửi khi chat 1-1 riêng tư hoặc người dùng trực tiếp gọi bot (`@bot` hoặc reply bot).
  - Đối với các trường hợp nghe lén (Proactive Intervention) hoặc nhắc tên bot ở ngôi thứ 3 (có thể dẫn đến quyết định `IGNORE`), tuyệt đối không gửi typing trước để tránh người dùng thấy bot báo đang soạn tin nhưng sau đó im lặng.
- **Nhận diện Thứ Trong Tuần & Hậu kiểm Lời chúc giữa tuần (`deepseek.js`):**
  - Tích hợp chuẩn xác thứ trong tuần (`dayName`: Thứ Hai đến Chủ Nhật theo giờ Việt Nam) vào biến `now` trong System Prompt (Ground Truth feeding), giữ System Prompt hoàn toàn tổng quát (General Prompt) không nhồi nhét rule tình huống.
  - Tầng Post-Processing ($0 token): Kiểm tra ngày thực tế trong tuần bằng logic code. Nếu từ Thứ 2 đến Thứ 6 mà LLM buột miệng chúc cuối tuần thì tự động thay thế thành lời chúc phù hợp.

## 22. Hợp nhất Tri thức Đa Nền tảng & Hệ thống Tự học 6 Trụ Cột Tri Thức (Comprehensive Self-Learning Framework) — 2026-10-08
- **Hợp nhất & Đồng bộ Liên Nền tảng (Cross-Platform Insights Merge & Sync):**
  - Hợp nhất kho bài học `human_insights` từ cả 2 cơ sở dữ liệu Firestore của LINE (`line-ai-chatbot-eab18`) và Telegram (`tele-ai-chatbot`), loại bỏ trùng lặp và làm giàu bộ triggers từ khóa.
  - Thiết lập cơ chế đồng bộ 2 chiều: Khi cron job tự học 3h sáng hoàn thành trên một nền tảng, hệ thống tự động đồng bộ kết quả sang Firestore của nền tảng còn lại thông qua Companion Service Account Key.
  - Cơ chế chống chạy trùng (Duplicate Study Guard): Lưu cờ `last_human_study_date` để nếu một bot đã hoàn thành học trong ngày thì bot còn lại sẽ tự động bỏ qua, tiết kiệm 100% token thừa.
- **Mở rộng 6 Trụ Cột Tri Thức Nhân Loại (Human Wisdom Pillars):**
  - Mở rộng kho chủ đề vượt ra khỏi các kỹ năng an ủi cơ bản sang 6 trụ cột toàn diện giúp bot thông thái, sâu sắc và giống người thật:
    1. *Thấu cảm & Giao tiếp (Empathy & Interpersonal)*: Lắng nghe chủ động, xoa dịu giận dữ, mở lòng người hướng nội, nghệ thuật đặt câu hỏi.
    2. *Tư duy phản biện (Critical Thinking & Cognitive Biases)*: Bẫy chi phí chìm (Sunk cost), định kiến xác nhận (Confirmation bias), hiệu ứng Dunning-Kruger, bẫy nhị nguyên, tách rời fact và feeling.
    3. *Triết lý sống thực tế (Practical Wisdom & Stoicism)*: Phân định điều kiểm soát được/không kiểm soát được, vượt qua hội chứng kẻ giả mạo (Imposter syndrome), giữ tâm thế tĩnh lặng (Equanimity), phục hồi sau nghịch cảnh.
    4. *Lối sống & Gu thưởng thức (Lifestyle & Sensory Pleasures)*: Thưởng thức cà phê sáng, những niềm vui bé nhỏ (Micro-joys), sống chậm (Slow living), sạc lại năng lượng khi kiệt sức.
    5. *Hóm hỉnh & Đối đáp tinh tế (Wit & Playful Banter)*: Tự trào duyên dáng, đảo chiều tình huống bất ngờ, dùng ẩn dụ sinh động, phân định lúc nào nên đùa và lúc nào cần nghiêm túc.
    6. *Tâm lý học hành vi & Thói quen (Behavioral Psychology & Habits)*: Quy tắc 2 phút vượt qua trì hoãn, thói quen tí hon (Atomic habits), quản trị năng lượng, thoát khỏi kiệt sức (Burnout).
- **Tăng tốc Tự học lên 10 bài/ngày & Tối thiểu hóa Chi phí ($0 Search API Cost):**
  - Tăng tốc độ học từ 1 bài lên 10 bài mỗi ngày, phân thành 2 batch gọn nhẹ (5 bài/batch) để tránh timeout và sinh JSON chuẩn xác.
  - Tận dụng năng lực hiểu biết sâu sắc của DeepSeek để đúc kết tri thức nhân loại mà không cần gọi API search Tavily/Exa bên ngoài ($0 search cost, chi phí LLM chỉ ~$0.001/ngày).
- **Tối ưu Matching theo Độ dài Từ khóa Kích hoạt (Specificity-Weighted Trigger Matching):**
  - Nâng cấp `matchRelevantInsight`: Khi người dùng trò chuyện, hệ thống ưu tiên từ khóa kích hoạt có độ dài lớn hơn (đặc thù hơn, ví dụ "thất bại trong công việc" thắng từ khóa chung chung "buồn"), đảm bảo luôn tiêm đúng 1 bài học đắt giá và chuẩn ngữ cảnh nhất vào System Prompt.

## 23. Đọc Link Sản Phẩm (Amazon/E-commerce) bằng End-User Browser Request & 3 Lớp Bóc Tách — 2026-10-26
- **Mô phỏng Request End-User Hoàn Chỉnh (`search.js`):**
  - Không chặn cứng domain; thay vào đó bot gửi request mô phỏng 100% một lượt nhấp link từ Trình duyệt người dùng thật (End-User Browser Request trên Chrome 131 Desktop / macOS).
  - Bổ sung đầy đủ bộ headers chuẩn gồm Client Hints (`sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`), `sec-fetch-dest: document`, `sec-fetch-mode: navigate`, `sec-fetch-site: none`, `sec-fetch-user: ?1`, `upgrade-insecure-requests: 1`, `Cache-Control: max-age=0`.
  - Hỗ trợ `maxRedirects: 5` để tự động xử lý các link rút gọn e-commerce phổ biến (như `a.co/d/...`, `amzn.to/...`).
- **Bộ Bóc Tách Chuyên Biệt cho E-commerce (`parseAmazonHtml`):**
  - Trích xuất thông minh và làm sạch cấu trúc sản phẩm: Tên sản phẩm (`#productTitle`), Giá (`.a-price`), Tác giả / Thương hiệu (`#bylineInfo`), Tính năng chính (`#feature-bullets`), Mô tả chi tiết (`#productDescription`).
  - Đóng gói dữ liệu súc tích, lược bỏ hàng triệu ký tự script/iframe rác để nạp vào Ground Truth context cho LLM với chi phí $0 token.
- **Kiến Trúc Fallback 3 Lớp Toàn Diện:**
  - **Lớp 1 (Trực tiếp):** End-User Browser Request với độ trễ tối thiểu và $0 API/Token cost.
  - **Lớp 2 (Tavily Extract API):** Nếu Lớp 1 bị lỗi mạng hoặc phát hiện Captcha/WAF, tự động gọi `https://api.tavily.com/extract` (sử dụng residential proxy và headless browser rendering để trích xuất nội dung gốc).
  - **Lớp 3 (Open Web Search Fallback):** Nếu vẫn chưa có nội dung, kích hoạt tìm kiếm mở trên toàn Web qua Tavily (`open_search: true`) thay vì bị giới hạn vào các trang tin tức thông thường.
- **Triệt tiêu Lời rào đón Máy móc (Clean & Natural Persona):**
  - Bot đọc thông tin từ link/search và trả lời trực tiếp, đầy đủ, tự nhiên vào sản phẩm/bài viết như một người thật đang cùng xem và đánh giá. Không bao giờ giải thích lằng nhằng về mặt kỹ thuật hay nói văn mẫu máy móc.

## 24. Nhận diện Đúng Trọng Tâm Câu Hỏi & Cô Lập Ngữ Cảnh Người Nói (Laser-Focused Focus & Speaker Isolation) — 2026-10-26
- **Cải tổ Nguyên tắc Trả lời Chống Lan man (Laser-Focused & Anti-Lan man Prompt):**
  - Tái cấu trúc nguyên tắc độ dài và phong cách (`brevityRule` & `Style` trong `buildSystemPrompt`): Đặt kim chỉ nam **"TRỌNG TÂM & ĐÚNG ĐÍCH"**. Bot trả lời thẳng vào bản chất câu hỏi ngay từ câu đầu tiên; cấm mở bài lan man, cấm rào đón sáo rỗng, cấm lặp lại câu hỏi của người dùng.
  - Phân tầng độ sâu theo ngữ cảnh: Với các câu hỏi đơn giản/ngắn, bot phản hồi trực tiếp, cô đọng (2-5 câu). Chỉ phân tích sâu, bóc tách nhiều góc độ khi người dùng có yêu cầu rõ ràng về giải thích chi tiết, so sánh hoặc hoạch định chiến lược.
  - Tinh chỉnh thẩm mỹ: Bỏ yêu cầu spam emoji dày đặc làm bullet point; chuyển sang phong cách tinh tế, tự nhiên, chỉ dùng 1-3 emoji thích hợp để giữ sự trang nhã và chuyên nghiệp.
- **Thuật toán Trích xuất Đối tượng Cần Tổng hợp (`extractTargetSpeaker` - $0 Compute Token):**
  - Xây dựng bộ bóc tách ngôn ngữ tự nhiên không tốn token LLM, nhận diện chuẩn xác ý định tổng hợp ý kiến của một cá nhân cụ thể trong nhóm chat (LINE & Telegram).
  - Phân biệt rõ giữa yêu cầu tóm tắt chính mình (Self-Summary: *"tổng hợp những gì tôi vừa nói"*) và ngôi thứ ba (*"tổng hợp nội dung của anh Lâm"*, *"anh Châu vừa bảo gì thế"*, *"ý kiến của Du"*).
  - So khớp linh hoạt (Fuzzy & Accent-Insensitive) với kho hồ sơ thành viên `participants` theo tên thật (`real_name`), tên hiển thị (`name`), username, và custom name.
  - Miễn nhiễm với các từ chỉ định tập thể / stop words chung (*"mọi người"*, *"cả nhóm"*, *"từ nãy giờ"*, *"tất cả"*), bảo đảm không bắt nhầm các lệnh tóm tắt toàn nhóm.
- **Cơ chế Cô Lập Dữ Liệu Người Nói Cứng (Zero-Contamination Ground Truth Isolation):**
  - **Lọc Dữ Liệu Độc Quyền:** Khi phát hiện yêu cầu tổng hợp một người cụ thể, hệ thống lọc tách riêng toàn bộ phát biểu của duy nhất người đó từ lịch sử tin nhắn gần nhất (`messagesArray`), đóng gói thành khối `[DỮ LIỆU ĐỘC QUYỀN - CHỈ DO {TargetName} PHÁT BIỂU]`.
  - **Chặn Hoàn Toàn Nhiễm Bẩn Lịch Sử (Cross-Contamination Firewall):** Triệt để loại bỏ khối `[TÓM TẮT LỊCH SỬ CŨ TỪ HỆ THỐNG]` (`filteredSummaries`) khỏi context khi tổng hợp cá nhân, ngăn chặn tình trạng LLM đọc bản tóm tắt cũ của cả nhóm và gộp nhầm ý kiến người khác vào người được hỏi.
  - **Guardrail Phân Quyền Người Nói (Speaker Attribution Guardrail):** Ràng buộc LLM chỉ được phép trích xuất từ khối dữ liệu độc quyền của đúng người đó. Nghiêm cấm đưa quan điểm/số liệu của người khác vào câu trả lời; nếu đối tượng không phát biểu về chủ đề, bot báo rõ ràng và trung thực.
- **Chuẩn hóa Định dạng Tổng hợp Nhóm:**
  - Đối với các yêu cầu tóm tắt chung toàn nhóm, ép buộc định dạng phân tách rõ ràng theo từng người nói: `• [Tên người]: [Ý kiến]`, chống hiện tượng gộp chung (Groupthink/Flattening) làm mờ nhạt người phát biểu.

## 25. Tối ưu Guardrails, Giao tiếp Tự nhiên, Cảm xúc Sticker & Góp lời Chủ động Tinh tế — 2026-11-22
- **Sửa triệt để phân loại cảm xúc Sticker (`analyzeEmotion` trong `index.js` - $0 Compute):**
  - Áp dụng word boundary (`\b`) cho các từ khóa tiếng Anh và ưu tiên lọc tín hiệu lịch sự/biết ơn/tích cực (`thank`, `sorry`, `bow`, `happy`, `love`, `cảm ơn`, `xin lỗi`, `🙏`) trước nhánh `negative`. Triệt tiêu tình trạng sticker cảm ơn/xin lỗi có kèm từ `cry`/`sad` bị gán nhầm `[SYSTEM ALERT]` tiêu cực.
- **Tinh gọn & Đồng bộ `dynamic_guardrails` Đa Nền tảng (`evolution.js`):**
  - Hạ trần `dynamic_guardrails` từ `50` xuống tối đa **`8` lệnh tổng quát** (tiết kiệm ~80% token guardrails mỗi request), bổ sung cơ chế `SKIP` chống trùng lặp và cấm sinh rule ad-hoc theo tên riêng/địa danh.
  - Tự động đồng bộ 2 chiều `dynamic_guardrails` sang Companion Project (`LINE ↔ Telegram`), đảm bảo Cross-Platform Parity.
- **Giao tiếp Không chắc chắn Tự nhiên (Anti-Robotic Rule Recitation trong `deepseek.js`):**
  - Tinh chỉnh Rule `2` & `2.2` để khi thiếu dữ kiện hoặc chưa rõ thông tin, bot phản hồi ngắn gọn, tự nhiên như người thật (*"cái này em không rõ lắm ạ"*), cấm lải nhải giải thích nội quy hay phân trần máy móc (*"em không thể nói điều chưa xác thực"*, *"anh chỉ cho phép em nói..."*).
- **Góp lời Chủ động Thông minh, Ngắn gọn & Đồng bộ 2 Nền tảng (`shouldTriggerProactive` + `waitForGroupSilence` trong `index.js` & `deepseek.js`):**
  - Mở rộng cơ chế Proactive Group Interjection cho **cả LINE và Telegram** với cooldown **60 phút** (kèm backoff **15 phút** khi `IGNORE`, và yêu cầu tối thiểu **4 tin nhắn** trong mạch hội thoại trước khi góp lời).
  - **Smart Silence Debounce (Chống chen ngang — \$0 API Cost):** Trước khi gọi LLM góp lời, chờ **4 giây im lặng** (kiểm tra cả RAM + RTDB cross-instance) và double-check lại ngay trước khi gửi — nếu có thành viên nhắn tiếp thì tự hủy để không bao giờ cắt ngang cuộc trò chuyện và tiết kiệm 100% token.
  - Tinh chỉnh prompt chế độ góp lời: chỉ nói **đúng 1 câu ngắn súc tích (tối đa 22 từ, 1 dòng)** mang tính chấm phá thông minh, tinh tế, hóm hỉnh và vui vẻ.

## 26. Chống Nhận Nhầm Tên Người (Dầu ≠ Duy) & Cập nhật Hồ sơ Ngầm — 2026-11-22
- **Tự động Đồng bộ `participants` khi Nghe ngầm (`syncPassiveParticipant` trong `index.js` - $0 API Cost):**
  - Mọi thành viên chat trong nhóm LINE/Telegram (dù không tag bot) đều được tự động lưu `userId` & `displayName` vào `line_participants` / `tg_participants`, khắc phục việc thiếu thành viên ít tag bot (như `Dau Dinh`, `daint`).
- **Nhận diện Tên Chính xác & Ưu tiên Tên Thật (`buildGroupProfileContext`, `resolveCanonicalUserId`, Rule `0`):**
  - So khớp mention theo cả có dấu và không dấu (`removeAccents`) để tên có dấu (vd: *"Dầu"*) luôn khớp đúng nick không dấu (vd: *"Dau Dinh"*).
  - Không bỏ qua thành viên chưa có `user_profiles` trên Firestore; hiển thị rõ `[Tên thật (nick: ...)]` giúp LLM luôn ưu tiên gọi tên thật thân thiện, chỉ dùng nick khi chưa có tên thật và tuyệt đối không lẫn các tên gần giống nhau (`Dầu ≠ Duy`).
  - Chặn `resolveCanonicalUserId` fallback về `senderId` khi `userIdAttr` được chỉ định rõ nhưng không khớp trong `participants`, ngăn ghi đè nhầm hồ sơ người khác.
- **Cập nhật Hồ sơ Ngầm (`processAndExtractProfile`):**
  - Xóa bỏ hoàn toàn thông báo `[Hệ thống: Đã cập nhật hồ sơ cá nhân]` khỏi tin nhắn trả lời, lưu hồ sơ ngầm 100% và triệt tiêu lỗi lặp thông báo 2 lần.

## 27. Tóm tắt Tổng hợp theo Chủ đề / Vấn đề Chính (Topic-Centric Summary) — 2026-11-22
- **Nâng cấp định dạng tóm tắt chung (`deepseek.js` - $0 Compute Cost):**
  - Thay thế định dạng liệt kê máy móc từng người nói (`• [Tên người]: [Ý kiến]`) bằng tổng hợp theo **Chủ đề / Vấn đề chính** (`• **[Chủ đề]**: nội dung cốt lõi, luận điểm chính và kết luận nếu có`), tự động lược bỏ tán gẫu vụn vặt để người dùng nắm nhanh bức tranh toàn cảnh.
  - Chỉ nhắc tên thành viên khi cần phân biệt quan điểm trái chiều quan trọng, vẫn đảm bảo nguyên tắc không gán nhầm ý kiến giữa các thành viên.
  - Giữ nguyên cơ chế Cô lập Người nói (`Speaker Isolation`) khi user yêu cầu tổng hợp riêng một cá nhân cụ thể, đồng thời cô đọng theo các ý chính thay vì chép lại từng tin nhắn rời rạc.

## 28. Phân loại Tìm kiếm Phân tầng 3 Lớp & Tự động Tiến hóa Hàng đêm (Hierarchical Taxonomy & Autonomous Evolution) — 2026-11-22
- **Cây Phân loại 3 Tầng Tinh gọn (`functions/utils/taxonomyRouter.js` — <1ms, $0 API Cost):**
  - Thay thế bộ regex phẳng ~2.000 từ khóa bằng cây 3 tầng gồm **6 Macro Domains** (`TECH`, `ECONOMY`, `SOCIETY_VN`, `WORLD_GEO`, `SOCIAL_TREND`, `LIFESTYLE`) → **15 Sub-topics** → **Weighted Common Concepts** (`core = 3`, `context = 1`).
  - **Zero-Entity Bloat:** Tuyệt đối không lưu tên riêng cá nhân/sự kiện nhất thời (như `jensen huang`, `mr pips`, `vf3`). Tên riêng đi kèm ngữ cảnh (vd: *"Jensen Huang từ chức"*) tự định tuyến theo khái niệm ngữ cảnh (`ECONOMY > business`); tên riêng thuần túy tự rơi về `GENERAL` (`Tavily general`).
  - Chấm điểm song song toàn cây theo ranh giới từ (hỗ trợ cả có dấu & không dấu `removeAccents`) để định tuyến chuẩn xác Search Engine (`Exa` vs `Tavily news/general`).
- **Tự động Tiến hóa Hàng đêm (`evolveTaxonomyFromLogs` trong `functions/utils/evolution.js`):**
  - Tự động chạy lúc `03:00` sáng hàng ngày trong `masterScheduler` (không cần gõ `/update` thủ công), có cờ `last_taxonomy_update_date` chống chạy lặp giữa LINE & Telegram.
  - Gom toàn bộ `audit_logs` vào **1 batch DeepSeek duy nhất/ngày** đóng vai *Taxonomy Architect*: lọc bỏ tên riêng & nhiễu, khái quát hóa thành khái niệm phổ quát, áp dụng Hard Cap chống phình database (tối đa 25 concepts/tier/sub-topic, 150 proactive triggers, 200 standalone topics).
  - Tự động đồng bộ 2 chiều **LINE ↔ Telegram**, dọn sạch `audit_logs` về **Inbox Zero**, và ghi log `EVOLUTION_TAXONOMY` vào RTDB để theo dõi qua `/learning`.
- **Xưng hô Lịch sự Toàn văn & Đồng bộ Profile `anh Du` (`deepseek.js` + Firestore):**
  - Bắt buộc luôn kèm danh xưng `anh/chị` trước tên thành viên trong toàn bộ câu trả lời (kể cả khi tóm tắt hay nhắc lại ở ngôi thứ 3), tuyệt đối không gọi tên trống không.
  - Đã đồng bộ chuẩn `real_name: "Du"` cho `user_profiles/730806080` (`Badpaybad`) trên Firestore `line-ai-chatbot-eab18`.

## 29. Kho Kỹ năng Tự tiến hóa & Lệnh `/skills` (Self-Evolving Modular Skill Library) — 2026-11-22
- **Lưu trữ tập trung & Siêu tiết kiệm (`system_configs/bot_skills` + RAM Cache 5 phút):**
  - Toàn bộ custom skills lưu trong 1 document `system_configs/bot_skills` (chỉ 1 Firestore Read / 5 phút), đồng bộ 2 chiều **LINE ↔ Telegram**, khởi tạo sẵn 10 kỹ năng nền tảng chất lượng cao (*Làm thơ Lục Bát*, *Review & Debug Code*, *Dịch thuật Tự nhiên*, *Phân tích Tài chính*, *So sánh Mua sắm*, *Viết Email Khéo léo*, *Tư duy Phản biện*, *Tóm tắt Tài liệu*, *Lịch trình Du lịch*, *Chơi chữ Hóm hỉnh*).
  - Mỗi custom prompt bị giới hạn gọn sạch (≤ 70 từ ~100 tokens), mạch lạc và giữ đúng phong cách Annie tự nhiên, thân thiện, tinh tế.
- **Kích hoạt Động "Just-in-Time" ([skillLibrary.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/skillLibrary.js) & [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js)):**
  - Chạy offline (< 1ms, $0 API cost), chỉ tiêm **duy nhất 1 skill khớp nhất** khi người dùng yêu cầu đúng ngữ cảnh, không bao giờ đổ cả kho skill gây loãng & tốn token.
- **Tự học & Chống Trùng Lặp Hàng ngày (`dailySkillEvolution` trong [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js)):**
  - Chạy tách biệt với `dailyHumanStudy` lúc `03:00` sáng trong `masterScheduler` (cờ `last_skill_study_date` chống chạy trùng giữa 2 nền tảng).
  - Áp dụng **2 lớp chống trùng lặp** (LLM Semantic Dedup + Offline slug/tên/overlap > 50% triggers) và Hard Cap **30 skills** để kho kỹ năng luôn tinh hoa, không dư thừa.
- **Lệnh Quản lý trên Telegram ([skills.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/commands/skills.js) — $0 LLM Cost):**
  - `/skills`: Liệt kê toàn bộ custom skills bot đã học theo nhóm kèm `slug`, `version` và mô tả ngắn.
  - `/skills_detail <tên skill>`: Tra cứu linh hoạt theo `slug` hoặc tên gần đúng, hiển thị chi tiết kèm toàn văn Custom Prompt từ database.
- **Chuẩn hóa Nhãn Người Nói Đồng bộ từ `user_profiles` (`buildCanonicalSpeakerMap` trong [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js)):**
  - Mọi tin nhắn cũ/mới bơm vào `history` và `[NEW]` đều được ánh xạ động qua `senderId` → `user_profiles` (RAM cache 5 phút) thành nhãn chuẩn `[anh/chị + Tên thật mới nhất]` (0% hardcode). Triệt tiêu hoàn toàn tình trạng lẫn nick cũ (`Badpaybad`) với tên thật (`anh Du`) hay gọi tên trống không (`Lâm`).
- **Khóa Trọng tâm Tuyệt đối & Nâng cấp Skill `lam_tho` v4 ([deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js), [commands/index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/commands/index.js), Firestore `bot_skills`):**
  - Siết chặt `brevityRule`: chỉ trả lời duy nhất câu hỏi `[NEW]`, cấm lôi chuyện cũ từ `Core_Memory`/lịch sử không liên quan và cấm giải thích lê thê hạn chế bản thân (*"em nói thật..."*).
  - Bổ sung Fast Path nhận diện câu hỏi tự nhiên về kỹ năng của bot (vd *"em có những skill gì"*) → trả thẳng từ Firestore `$0` token.
  - Nâng cấp `lam_tho` v5 theo **4 nguyên tắc vàng Lục Bát**: mặc định lục bát vui vẻ, hóm hỉnh, **đúng 8 câu** (4 cặp 6–8), vần Bằng chuẩn phối ngang–huyền, không chen văn xuôi hay dấu `*`; chuyển tiêm Custom Skill xuống **Recency Anchor** ngay sát `[NEW]` và hỗ trợ convert `*italic*` → `<i>` trong [telegram.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/telegram.js).
- **Chống Race Condition Cron Tiến hóa Đêm ([evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js)):**
  - Khóa `runDailyEvolution()` chỉ chạy trên node chủ `PLATFORM === "LINE"` (tự đồng bộ 2 chiều sang Telegram) kèm cơ chế **Lock-before-compute** (ghi cờ ngày trước khi gọi DeepSeek), triệt tiêu lỗi chạy song song tốn x2 token lúc `03:00` sáng.

## 30. Giám khảo Độc lập Chấm điểm Chatbot Theo Chu kỳ Động (Independent AI Reviewer — G-Eval + BARS 100 Điểm) — 2026-11-24
- **Cấu hình Chu kỳ Động qua `.env` & \$0 Chi phí Hạ tầng:**
  - Chạy trực tiếp trên `masterScheduler` theo biến `REVIEW_INTERVAL_DAYS` (`1` = hàng ngày, `7` = hàng tuần, `30` = hàng tháng, `0` = tắt) và `REVIEW_HOUR` (mặc định `8` = `08:00 AM`), không tốn thêm Cloud Scheduler hay Cloud Function. Hỗ trợ lệnh `/review` hoặc `/review <số_ngày>` cho Admin Eddy (`2140581850`).
  - Tự động co giãn thời gian giữ `logs/qa_traces` và `logs/system_logs` theo `REVIEW_INTERVAL_DAYS + 3` ngày (tối đa 43 ngày) để luôn bao phủ trọn vẹn 100% khoảng thời gian giữa 2 kỳ chấm.
- **Lưu trữ Đầy đủ cho Antigravity IDE (`system_configs/bot_reviews_history`):**
  - Lưu trọn vẹn 24 kỳ chấm gần nhất (điểm số, `pillars_analysis`, `delta_explanation`, `weaknesses`, `next_upgrades`, `hardMetrics` kèm xu hướng đầu kỳ vs cuối kỳ, và `reportText`) đồng bộ trên cả 2 nền tảng.
  - Tích hợp sẵn skill `.agents/skills/review/SKILL.md` và script [read_bot_reviews.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/scratch/read_bot_reviews.js) để Antigravity IDE có thể đọc lại lịch sử chấm điểm và đề xuất nâng cấp bất cứ lúc nào.
- **Độc lập Chéo Mô hình & Lấy mẫu Phân tầng Đa Ngày ([reviewer.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/reviewer.js)):**
  - Sử dụng **Gemini 2.5 Flash** (JSON mode) làm Giám khảo độc lập chấm điểm **DeepSeek** (fallback sang DeepSeek `temperature: 0.15`).
  - Tính **Hard Telemetry** trên 100% toàn bộ lượt chat của cả kỳ, kết hợp **Time-Stratified Sampling** (tối đa 30 mẫu đại diện từ đầu → giữa → cuối kỳ + ưu tiên bắt mẫu bất thường/proactive) giúp chấm kỳ 30 ngày vẫn giữ nguyên chi phí token thấp như chấm 1 ngày.

## 31. Smart Conversational Focus Mode 3 Lớp (Nối mạch Tự nhiên & Tự động Nhả Focus khi Đổi Chủ đề) — 2026-11-24
- **Lớp 1 — Đồng bộ Trạng thái Focus Xuyên Instance (RAM + RTDB, Sliding Window 5 phút):**
  - Lưu trạng thái Focus tại cả RAM và RTDB `chats/${chatId}/metadata/focusState` ($0 write), giữ mạch xuyên suốt kể cả khi Cloud Functions scale nhiều instance. Tự gia hạn 5 phút mỗi khi bot trả lời trực tiếp user (không bật Focus cho câu góp lời Proactive ngầm để tránh đeo bám).
  - Theo dõi cờ `peerSpokeSinceBot` khi có thành viên khác xen vào hội thoại, và hỗ trợ nhận diện quote trực tiếp tin nhắn của bot trên LINE (`lastBotMsgId`).
- **Lớp 2 — Bộ Lọc Luân phiên Lượt nói & Đại từ Offline (`evaluateFocusFollowUp` — <0.5ms, $0):**
  - Chấp nhận các câu phản hồi/yêu cầu/góp ý nối tiếp tự nhiên không có dấu `?` khi đang trong mạch 1-1 liên tục với bot hoặc khi gọi `"em"`.
  - **Tự ngắt Focus tức thì ($0 LLM cost)** khi user tag/reply thành viên khác, hoặc chuyển sang đại từ ngang hàng với bạn bè (`tớ`, `cậu`, `mày`, `tao`, `các bác`, `ae ơi`...) hay nhắc bot ở ngôi thứ 3 (`con bot`, `bảo nó`).
- **Lớp 3 — Cổng Kiểm định Đổi Chủ đề bằng LLM & Tự động Nhả Focus (`deepseek.js` + `index.js`):**
  - Đối chiếu tin `[NEW]` với câu trả lời vừa xong của bot: nếu user đã đổi hẳn sang chủ đề tán gẫu khác với nhóm, LLM trả về `IGNORE` và hệ thống lập tức xóa trạng thái Focus (`clearFocusState`) để không gọi LLM ở các tin tán gẫu tiếp theo.

## 32. Bộ Kiểm định Lục Bát Bằng Thuật Toán & Tự Sửa 1-Shot (`lucBatValidator.js` + `lam_tho` v6) — 2026-11-24
- **Nâng cấp `lam_tho` v6 (Firestore LINE & Telegram):** Bổ sung sơ đồ vần nối liên hoàn `A → B → C → D → E` kèm ví dụ mẫu (few-shot) chuẩn vần nối hóm hỉnh, thuần Việt 100%, đồng thời rà soát dọn trùng trigger cho `ky_nang_thuong_luong`, `lich_trinh_du_lich`, `giai_ma_hop_dong`.
- **Programmatic Lục Bát Verifier & 1-Shot Auto-Repair ([lucBatValidator.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/lucBatValidator.js) & [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js)):**
  - Tách phần vần tiếng Việt và kiểm tra tự động (< 0.2ms, $0) số tiếng (6–8) + vần trong cặp + vần nối liên cặp + thanh Bằng ngay sau khi bot làm thơ.
  - Nếu đạt chuẩn ngay lượt đầu → gửi thẳng ($0 phụ phí); nếu phát hiện dòng gãy vần/sai tiếng → tự kích hoạt 1 lượt sửa chính xác vào đúng dòng lỗi trước khi gửi cho user.


- **Bộ Tiêu chí BARS 100 Điểm Không Xung đột (4 Trụ cột Độc lập MECE):**
  - **Thông minh (30đ):** Độ thông thái, thấu hiểu ẩn ý/vấn đề, logic & chất lượng giải pháp.
  - **Tinh tế (25đ):** Độ tự nhiên như con người, xưng hô chuẩn `anh/chị + tên thật`, nhịp độ & độ súc tích khi góp lời chủ động.
  - **Chính xác (25đ):** Bám sát 100% câu hỏi `[NEW]` (Single-Focus), chuẩn dữ kiện/thời điểm, không nhầm người.
  - **Khả năng tiến bộ (20đ):** Mức độ khắc phục lỗi kỳ trước và hiệu quả của các nâng cấp/tự học mới (`bot_skills`, `human_insights`, `taxonomy`).
  - Phân hạng tự động bằng JS: **Xuất sắc (85–100)**, **Tốt (70–84)**, **Trung bình (50–69)**, **Tồi (0–49)**; bắt buộc giải trình mọi tăng/giảm điểm kèm bằng chứng log và đề xuất 2–3 cải tiến "Wow" tiếp theo.














