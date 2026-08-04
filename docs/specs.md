# Thông số kỹ thuật (Technical Specifications)
_Cập nhật lần cuối: 2026-08-04_

## Tổng quan Module

| Tên File | Chức năng chính |
|---|---|
| `functions/index.js` | Entry point nhận Webhook từ LINE/Telegram. Xử lý logic vòng đời tin nhắn, phân tích cảm xúc (EQ), parse Action Tags, Mentions. Chạy MasterScheduler (cron job). |
| `functions/utils/db.js` | Wrapper quản lý Firebase RTDB, Firestore và RAM Cache. Cung cấp hàm lưu/đọc dữ liệu (Profile, Facts, Schedules, Metadata). |
| `functions/utils/llm.js` | Router phân luồng cấu hình LLM_PROVIDER để chọn DeepSeek hay Gemini. |
| `functions/utils/deepseek.js` | Core chat LLM. Khởi tạo System Prompt động (nhồi Dynamic Rules & JSON LTM). Hỗ trợ ReAct Tool Calling (search). Tích hợp Dual-Process Classifier để chọn model. |
| `functions/utils/gemini.js` | LLM phụ trợ tác vụ nặng. Phân tích ảnh/tài liệu. Nén trí nhớ (LTM JSON) và trích xuất Audit Logs. |
| `functions/utils/search.js` | Phân tích từ khóa tìm kiếm (Regex offline check). Trích xuất nội dung link web (Scraping). Gọi API Tavily/Exa. RTDB WebContext caching. |
| `functions/utils/tavily.js` | Wrapper API Tavily. Xử lý tìm kiếm tin thời sự, có chia nguồn VN/Quốc tế. |
| `functions/utils/exa.js` | Wrapper API Exa. Tìm kiếm chuyên sâu (Dev, Social). Cân bằng quota thông minh với Firestore tracking. |
| `functions/utils/news.js` | Sinh bản tin buổi sáng và chiều dựa vào Web Search và DeepSeek LLM. |
| `functions/utils/telegram.js` | Thao tác API Telegram (Gửi tin nhắn, chunking nội dung dài, phím bấm, reaction). |
| `functions/utils/line.js` | Thao tác API LINE (Gửi tin nhắn định dạng textV2 chứa mention, push message). |
| `functions/utils/logger.js` | Log sự kiện vận hành. |

---

## Luồng xử lý chi tiết

### 1. Chat Text thường (Telegram + LINE riêng biệt)
1. **Tiếp nhận & Validate**: Webhook vào `index.js`. Kiểm tra `processedWebhooks` (RAM Cache). Kiểm tra Secret Token (Telegram).
2. **Tiền xử lý (Offline)**: Gọi `checkNeedsSearch` (từ `search.js`). Kiểm tra rò rỉ prompt. Nhận diện và chuyển đổi cảm xúc từ Emojis/Stickers thành `System Alert` nội suy.
3. **Thu thập Ngữ cảnh**: 
   - RTDB: Đọc lịch sử 25 tin nhắn gần nhất.
   - Firestore/RAM: Bơm thông tin User Profile (Core_Memory JSON, Dynamic_Rules) vào Prompt.
   - Truy vấn Facts từ `globalFactsIndexCache`.
4. **Phân giải Ngữ cảnh Web (Web Context Resolution)**: Xử lý các đường dẫn (URL) hoặc từ khóa qua `search.js`.
5. **Khởi tạo Prompt LLM**: Xây dựng `System Prompt` tại `deepseek.js`. Áp dụng `BrevityRule` linh hoạt.
6. **LLM Phản hồi**: DeepSeek trả về text có chứa Action Tags. Dual-Process tự động chọn model (Flash hoặc Reasoner) tùy độ khó.
7. **Parse Action Tags & Mentions**: `index.js` bóc tách `<PROFILE>`, `<FACT>`, `<SCHEDULE>`, `<REACT>`. Chuẩn hóa các `@tên`.
8. **Phản hồi User**: Chặt nội dung thành từng đoạn 2000 ký tự (Telegram) hoặc gửi đi bằng API Reply.

### 2. Lazy Image Processing (Xử lý Đa phương tiện)
- **Tối ưu Băng thông**: Khi có Image/File, hệ thống KHÔNG tải xuống lập tức.
- **On-demand Download**: Chỉ khi cần mô tả, hệ thống gọi `downloadMessageFile` lưu tạm ra `/tmp/`.
- **Phân tích (Gemini)**: Gửi file qua API Gemini (3.0 Flash) để mô tả nội dung. Sau đó xóa file local.

### 3. Web Context Resolution (Search Decision Tree)
1. **Kiểm tra Catch Cứng (Fast Path)**: Các câu hỏi giờ giấc / ngày tháng hiện tại sẽ bỏ qua API.
2. **Kiểm tra URL Scraping**: Cào nội dung link người dùng gửi.
3. **Phân lớp Tìm kiếm**:
   - Mảng (News/Finance) -> Ưu tiên Tavily.
   - Mảng (Dev/Social) -> Ưu tiên Exa.
4. **Giới hạn & Fail-safe**: Nếu Tavily bị rate limit (429), fallback sang Exa. Quản lý Quota của Exa thông qua biến đếm (max 950) trong Firestore.

### 4. DeepSeek Chat function (Tool Calling / Dual-Process)
- **Dual-Process Classifier**: Tự động đánh giá prompt. Các câu hỏi logic phức tạp hoặc code sẽ được bẻ lái sang `deepseek-v4-reasoner`. Các câu hỏi thường dùng `deepseek-v4-flash`.
- **Vòng lặp ReAct**: 
  - LLM tự động gọi tool `google_search`.
  - Kết quả search bơm lại vào context để LLM trả về câu trả lời cuối (Giới hạn 2 lượt để tránh infinite loop).

### 5. MasterScheduler (Cron tasks)
Chạy bằng Cloud Scheduler định kỳ:
- Dọn dẹp cache `processedWebhooks`, `active_sessions`.
- Xử lý các lịch hẹn (`getDueSchedules()`) và xóa lịch trình rác.
- Gửi Daily News Digest (Sáng / Chiều).
- **Semantic Compression**: Gọi API Gemini để nén lịch sử chat thành JSON `Core_Memory` và trích xuất `Dynamic_Rules` rồi lưu đè vào Firestore.

### 6. Hybrid Memory (3 tầng RAM/RTDB/Firestore)
Hệ thống kết hợp 3 tầng dữ liệu để tối ưu tốc độ và chi phí:
- **Tầng L1 (RAM Cache - 5 phút)**: Chứa các cấu hình bot (botConfig), User Profiles, WebContext Cache.
- **Tầng L2 (Firebase RTDB)**: Lưu tin nhắn thô, Lịch hẹn (Schedules), Facts. KHÔNG tốn phí ghi (Write).
- **Tầng L3 (Firestore)**: Lưu vĩnh viễn Hồ sơ người dùng (đã nén JSON), Nhật ký lỗi (Audit Logs - giữ 30 ngày), Cấu hình động.

---

## Các logic hỗ trợ đặc biệt

- **Profile Extraction**: Bóc tách thẻ `<PROFILE>`. Cập nhật JSON Profile ngầm bằng LLM và lưu vào Firestore.
- **Auto-Topic Sync**: Bắt thẻ `<TOPIC>` và lưu vào `hotTopic` trên RTDB.
- **Dynamic Rules Extraction**: Khả năng tự học luật ứng xử thông qua luồng nén lịch sử và tự đưa vào prompt.
- **Mention Resolution**: 
  - LINE: Tự động đổi `@tên` thành `{user_X}` và gán `substitution`.
  - Telegram: Tự động đổi `@tên` thành `<a href="tg://user?id=X">tên</a>`.
- **Global Fact Approval**: Thành viên tạo `<FACT>` mới sẽ được gửi về Telegram Admin duyệt.
- **Whitelist**: Cấu hình kiểm soát phân quyền (`ALLOWED_LINE_USERS`, `ALLOWED_TELEGRAM_USERS`).

---

## Cấu trúc Dữ liệu (Database Schema)

### Realtime Database (RTDB)
```json
{
  "active_sessions": {
    "session_id_123": true
  },
  "metadata": {
    "TELEGRAM_participants": { "user_1": "Tên Người Dùng" }
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
  },
  "facts": {
    "global": {
      "index": { "fact_1": { "topic": "Vật Lý", "keywords": ["lực", "hút"] } },
      "detail": { "fact_1": { "content": "..." } }
    },
    "pending": {
      "fact_2": { "topic": "Kinh tế", "senderName": "Nguyễn A", "status": "pending" }
    }
  },
  "schedules": {
    "sch_abc123": { "userId": "...", "timeStr": "...", "nextRun": 1722744000000 }
  }
}
```

### Cloud Firestore
```text
/system_configs
  /bot_config (Lưu trữ JSON: dynamic_guardrails, human_insights, search_keywords...)

/user_profiles
  /{userId} (Lưu trữ: real_name, gender, Dynamic_Rules, Core_Memory dạng JSON)

/audit_logs
  /{logId} (Lưu trữ: audit_keywords, audit_issues, missed_topics..., expireAt)

/metadata
  /exa_usage (Lưu trữ: month, count để quản lý Quota 950 queries)
```

---

## Biến môi trường (Environment Variables)

| Biến | Mục đích |
|---|---|
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
| `NOTIFICATION_TARGET_IDS` | Danh sách ID nhận bản tin tự động hàng ngày. |
