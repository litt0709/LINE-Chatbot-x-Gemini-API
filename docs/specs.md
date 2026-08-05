# Luồng kỹ thuật chi tiết (Technical Specs)
_Cập nhật lần cuối: 2026-08-05_

## Tóm tắt Module

| File | Nhiệm vụ chính |
|---|---|
| `functions/index.js` | Entry point của Webhook (LINE & Telegram). Validate request. Idempotency Cache (State-based). Bóc tách Action Tags. Vẽ ASCII Art trực tiếp. Gọi LLM và điều phối phản hồi. Quản lý Cross-Environment Notification. Xử lý File/PDF > 5MB. |
| `functions/utils/db.js` | Hàm tiện ích thao tác với Firebase RTDB (Cache, ghi tin nhắn thô, lịch hẹn, trạng thái chạy masterScheduler) và Firestore (Hồ sơ người dùng). |
| `functions/utils/llm.js` | Router phân luồng cấu hình LLM_PROVIDER để chọn DeepSeek hay Gemini. |
| `functions/utils/deepseek.js` | Core chat LLM. Khởi tạo System Prompt động (nhồi Persona Anchor, MBTI, RAG Skill Vectors & JSON LTM). Hỗ trợ ReAct Tool Calling (search). Tích hợp Dual-Process Classifier để chọn model, tích hợp logic Auto-Retry chống ECONNRESET. |
| `functions/utils/gemini.js` | LLM phụ trợ tác vụ nặng. Phân tích ảnh/tài liệu qua File API (Hỗ trợ PDF với Prompt đặc thù). Nén trí nhớ (LTM JSON, MBTI, Skill Vectors) và trích xuất Audit Logs. |
| `functions/utils/search.js` | Phân tích từ khóa tìm kiếm. Trích xuất nội dung link web. Chặn và phân tích PDF Links < 5MB (Bypass Scraping). Gọi API Tavily/Exa. RTDB WebContext caching. |
| `functions/utils/tavily.js` | Wrapper API Tavily. Xử lý tìm kiếm tin thời sự, có chia nguồn VN/Quốc tế. |
| `functions/commands/report.js` | Lệnh nội bộ (Internal Command). Tạo báo cáo tài chính/token xuyên nền tảng (Cross-project RTDB fetch), hỗ trợ tổng kết hàng tháng và web search. |
| `functions/utils/exa.js` | Wrapper API Exa. Tìm kiếm chuyên sâu (Dev, Social). Cân bằng quota thông minh với Firestore tracking. |
| `functions/utils/news.js` | Sinh bản tin buổi sáng và chiều dựa vào Web Search và DeepSeek LLM. |
| `functions/utils/telegram.js` | Thao tác API Telegram (Gửi tin nhắn, chunking nội dung dài, phím bấm, reaction). |
| `functions/utils/line.js` | Thao tác API LINE (Gửi tin nhắn định dạng textV2 chứa mention, push message). |
| `functions/utils/logger.js` | Log sự kiện vận hành. |

---

## Luồng xử lý chi tiết

### 1. Chat Text thường & Lệnh trực tiếp (Telegram + LINE)
1. **Tiếp nhận & Validate**: Webhook vào `index.js`. Kiểm tra `processedWebhooks` (RAM Cache). Kiểm tra Secret Token (Telegram).
2. **Tiền xử lý (Offline)**: 
   - Nếu lệnh `/vẽ`: Sinh tức thời ASCII Art bằng thư viện `figlet` và trả về ngay lập tức (Zero-cost logic).
   - Nếu tin thường: Nhận diện cảm xúc từ Emojis/Stickers thành `System Alert` nội suy. Kiểm tra rò rỉ prompt. 
3. **Thu thập Ngữ cảnh**: 
   - RTDB: Đọc lịch sử 25 tin nhắn gần nhất.
   - Firestore/RAM: Bơm thông tin User Profile (Core_Memory JSON, MBTI_Profile, Skill_Vectors) vào Prompt.
   - Kích hoạt RAG Filter: Chỉ nạp vector "làm thơ/viết văn" nếu trong lời nói có cụm từ tương ứng.
   - **Tối ưu Group Context**: Nhận diện Mention thông qua Regex Strict Boundaries để tiết kiệm Token, chỉ nhồi Profile nếu User bị nhắc tên đích danh hoặc Sender dùng đại từ xưng hô.
4. **Phân giải Ngữ cảnh Web (Web Context Resolution)**: Xử lý các đường dẫn (URL) hoặc từ khóa qua `search.js`.
5. **Khởi tạo Prompt LLM**: Xây dựng `System Prompt` tại `deepseek.js`. Áp dụng `Persona Anchor` chống ba phải.
6. **LLM Phản hồi**: Dual-Process tự động chọn model:
   - Dễ: `deepseek-v4-flash`.
   - Khó: `deepseek-v4-pro`.
   - **DeepSeek Auto-Retry**: Nếu lỗi kết nối mạng (ECONNRESET/aborted), tự động retry 2 lần (cách 1s) trước khi văng lỗi.
   - **DeepSeek Fallback**: Nếu `v4-pro` sập kết nối hoàn toàn -> Tự động gọi lại bằng `v4-flash` ngay lập tức để đảm bảo bot không bao giờ "câm".
7. **Parse Action Tags & Mentions**: `index.js` bóc tách `<PROFILE>`, `<FACT>`, `<SCHEDULE>`, `<REACT>`. Chuẩn hóa các `@tên`.
8. **Phản hồi User**: Chặt nội dung thành từng đoạn 2000 ký tự (Telegram) hoặc gửi đi bằng API Reply (LINE dùng textV2 mention).
9. **Lưu trữ**: Lưu tin nhắn vào RTDB.

### 2. Lazy Image Processing & PDF Reading (Xử lý Đa phương tiện)
- **Bảo vệ tài nguyên**: Telegram Webhook/LINE Event khi báo có Document/File, hệ thống lập tức check size > 5MB sẽ drop ngay lập tức.
- **Tối ưu Băng thông**: Với File < 5MB, hệ thống KHÔNG tải xuống lập tức nếu gửi chay (không kèm caption).
- **On-demand Download**: Chỉ khi nhắc đến tài liệu, hệ thống gọi `downloadMessageFile` lưu tạm ra `/tmp/`.
- **Phân tích (Gemini)**: Gửi file qua API Gemini (3.0 Flash qua File API). Nếu là PDF (`isPdf=true`), nhồi Prompt phân tích cấu trúc bài viết (Concept, Phương pháp, Kết quả, Research Gap). Sau đó xóa file local.

### 2.5 Lệnh `/report` Xuyên nền tảng (Cross-Platform)
- Lệnh được gọi từ `index.js`. File `commands/report.js` chịu trách nhiệm.
- **Dynamic Service Account**: Sử dụng `PLATFORM` Env Var để lấy Admin SDK chéo. (Ví dụ Telegram sẽ init app của LINE).
- **Data Merging**: Đọc `metrics/daily_tokens` và `metrics/monthly_calls` từ cả 2 nguồn RTDB, nhóm theo tháng, và xuất ra báo cáo duy nhất. Mức phí Search tính $0.005/lượt.

### 3. MasterScheduler (Cron Job)
- Chạy mỗi 5 phút một lần từ Cloud Scheduler.
- **Idempotency (Chống lặp lộn xộn)**: Dùng cờ `system_state/master_scheduler_processed` tại RTDB để đảm bảo Telegram server và LINE server không chạy đè lên nhau. Node nào giành được lock sẽ chạy.
- Thực hiện xoá tin rác, tổng hợp bộ nhớ dài hạn, tạo báo cáo tin tức `news.js`...

### 3. Web Context Resolution (Search Decision Tree)
1. **Kiểm tra Catch Cứng (Fast Path)**: Các câu hỏi giờ giấc / ngày tháng hiện tại sẽ bỏ qua API.
2. **Kiểm tra URL Scraping**: Cào nội dung link người dùng gửi.
3. **Phân lớp Tìm kiếm**:
   - Mảng (News/Finance) -> Ưu tiên Tavily.
   - Mảng (Dev/Social) -> Ưu tiên Exa.
4. **Giới hạn & Fail-safe**: Nếu Tavily bị rate limit (429), fallback sang Exa. Quản lý Quota của Exa thông qua biến đếm (max 950) trong Firestore.

### 4. DeepSeek Chat function (Tool Calling / Dual-Process)
- **Dual-Process Classifier**: Tự động đánh giá prompt. Các câu hỏi logic phức tạp hoặc code sẽ được bẻ lái sang `deepseek-v4-pro`. Các câu hỏi thường dùng `deepseek-v4-flash`.
- **Vòng lặp ReAct**: 
  - LLM tự động gọi tool `google_search`.
  - Kết quả search bơm lại vào context để LLM trả về câu trả lời cuối (Giới hạn 2 lượt để tránh infinite loop).

### 5. MasterScheduler (Cron tasks)
Chạy bằng Cloud Scheduler định kỳ:
- Dọn dẹp cache `processedWebhooks`, `active_sessions`.
- Xử lý các lịch hẹn (`getDueSchedules()`) và xóa lịch trình rác.
- Gửi Daily News Digest (Sáng / Chiều). *Routing động thông qua `process.env.PLATFORM` (TELEGRAM/LINE)*.
- **Semantic Compression**: Lúc nửa đêm, gọi API Gemini nén lịch sử chat thành JSON `Core_Memory`, trích xuất `Dynamic_Rules` (Skill Vectors), phân tích `MBTI Profile` và Audit Logs, sau đó gộp chung 1 phiên Write lưu vào Firestore.

### 6. Hybrid Memory (3 tầng RAM/RTDB/Firestore)
Hệ thống kết hợp 3 tầng dữ liệu để tối ưu tốc độ và chi phí:
- **Tầng L1 (RAM Cache - 5 phút)**: Chứa cấu hình bot, User Profiles, WebContext Cache.
- **Tầng L2 (Firebase RTDB)**: Lưu tin nhắn thô, Lịch hẹn, Facts. KHÔNG tốn phí ghi (Write).
- **Tầng L3 (Firestore)**: Lưu vĩnh viễn Hồ sơ người dùng (Core_Memory, MBTI, Skill Vectors), Nhật ký lỗi (Audit Logs), Cấu hình động.

---

## Các logic hỗ trợ đặc biệt

- **Persona Anchor**: Cố định tích cách ngoan ngoãn, từ chối hùa theo cái ác, độc lập với Empathy Mirroring.
- **RAG Filter**: Lọc các kỹ năng (Skill Vectors) không cần thiết để tối ưu Token context window.
- **Auto-Topic Sync**: Bắt thẻ `<TOPIC>` và lưu vào `hotTopic` trên RTDB.
- **Dynamic Rules Extraction**: Khả năng tự học luật ứng xử thông qua luồng nén lịch sử và tự đưa vào prompt.
- **Mention Resolution**: 
  - LINE: Tự động đổi `@tên` thành `{user_X}` và gán `substitution`.
  - Telegram: Tự động đổi `@tên` thành `<a href="tg://user?id=X">tên</a>`.

---

## Cấu trúc Dữ liệu (Database Schema)

### Realtime Database (RTDB)
```json
{
  "active_sessions": {
    "session_id_123": true
  },
  "chats": {
    "session_id_123": {
      "metadata": {
        "hotTopic": "Chủ đề đang bàn luận",
        "last_web_context": { "context": "...", "createdAt": 1722744000000 }
      },
      "messages": {
        "msg_push_id": { "role": "user", "text": "Tin nhắn...", "senderName": "ABC" }
      }
    }
  }
}
```

### Cloud Firestore
```text
/system_configs
  /bot_config (Lưu trữ JSON: dynamic_guardrails, human_insights, search_keywords...)

/user_profiles
  /{userId} (Lưu trữ: real_name, mbti_profile, skill_vectors, Dynamic_Rules, Core_Memory)

/audit_logs
  /{logId} (Lưu trữ: audit_keywords, audit_issues, missed_topics..., expireAt)

/metadata
  /exa_usage (Lưu trữ: month, count để quản lý Quota 950 queries)
```

---

## Biến môi trường (Environment Variables)

| Biến | Mục đích |
|---|---|
| `PLATFORM` | Chọn môi trường triển khai (`LINE` hoặc `TELEGRAM`). |
| `DEEPSEEK_API_KEY` | Key giao tiếp với AI DeepSeek (Chat/Reasoning). |
| `DEEPSEEK_MODEL` | Default model của DeepSeek (VD: deepseek-v4-flash). |
| `API_KEY` | Key giao tiếp với AI Gemini (Multimodal/Summarize). |
| `LLM_PROVIDER` | Phân luồng mặc định (`DEEPSEEK` hoặc `GEMINI`). |
| `TAVILY_API_KEY` | Key gọi Search API (News/General). |
| `EXA_API_KEY` | Key gọi Search API (Dev/Social, max 950 queries/month). |
| `CHANNEL_ACCESS_TOKEN` | Token kết nối LINE Messaging API. |
| `TELEGRAM_BOT_TOKEN` | Token kết nối Telegram Bot API. |
| `TELEGRAM_BOT_USERNAME` | Tên người dùng của Bot trên Telegram. |
| `TELEGRAM_SECRET_TOKEN` | Khóa bảo mật xác thực Webhook của Telegram. |
| `TELEGRAM_ADMIN_APPPROVAL_ID`| Chat ID của Admin duyệt Global Facts. |
| `NOTIFICATION_TARGET_IDS` | Danh sách ID nhận bản tin tự động hàng ngày (Riêng biệt cho từng PLATFORM). |
