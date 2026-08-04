# Thông số kỹ thuật (Technical Specifications)
_Cập nhật lần cuối: 2026-08-04_

## Tổng quan Module

| Tên File | Chức năng chính |
|---|---|
| `functions/index.js` | Entry point nhận Webhook từ LINE/Telegram. Xử lý logic vòng đời tin nhắn, parse Action Tags, Mentions, kiểm duyệt duyệt Facts. Chạy MasterScheduler (cron job). |
| `functions/utils/db.js` | Wrapper quản lý Firebase RTDB, Firestore và RAM Cache. Cung cấp hàm lưu/đọc dữ liệu (Profile, Facts, Schedules, Metadata). |
| `functions/utils/llm.js` | Router phân luồng cấu hình LLM_PROVIDER để chọn DeepSeek hay Gemini. |
| `functions/utils/deepseek.js` | Core chat LLM. Khởi tạo System Prompt động. Hỗ trợ ReAct Tool Calling (search). Tối ưu Brevity rules. |
| `functions/utils/gemini.js` | LLM phụ trợ tác vụ nặng. Phân tích ảnh/tài liệu. Nén trí nhớ (Rolling Summary) và trích xuất Audit Logs. |
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
1. **Tiếp nhận & Validate**: Webhook (từ Telegram/LINE) vào `index.js`. Kiểm tra `processedWebhooks` (RAM Cache) chống spam gửi trùng lặp. Kiểm tra Secret Token (Telegram).
2. **Tiền xử lý (Offline)**: Gọi `checkNeedsSearch` (từ `search.js`) để đánh giá nhanh xem câu hỏi có thuộc mẫu bắt buộc gọi Search API không. Đồng thời kiểm tra rò rỉ prompt (Prompt Leakage).
3. **Thu thập Ngữ cảnh**: 
   - RTDB: Đọc lịch sử 25 tin nhắn gần nhất.
   - Firestore/RAM: Lọc và bơm thông tin User Profile vào Prompt (kích hoạt bằng Mentions hoặc từ khóa cá nhân).
   - Truy vấn Facts từ `globalFactsIndexCache`.
4. **Phân giải Ngữ cảnh Web (Web Context Resolution)**: Xử lý các đường dẫn (URL) hoặc từ khóa qua `search.js` (Scrape trực tiếp -> Tavily/Exa). 
5. **Khởi tạo Prompt LLM**: Xây dựng `System Prompt` tại `deepseek.js`. Áp dụng `BrevityRule` linh hoạt phụ thuộc cấu hình `botConfig`, biến `isGroup` và `isSummaryReq`.
6. **LLM Phản hồi**: DeepSeek trả về text có chứa Action Tags (nếu LLM suy luận cần thực hiện hành động).
7. **Parse Action Tags & Mentions**: `index.js` bóc tách `<PROFILE>`, `<FACT>`, `<SCHEDULE>`, `<REACT>`. Chuẩn hóa các `@tên` thành `textV2` Mention (cho LINE) hoặc `HTML` Mention (cho Telegram).
8. **Phản hồi User**: Chặt nội dung thành từng đoạn 2000 ký tự (Telegram) hoặc gửi đi bằng API Reply.

### 2. Lazy Image Processing (Xử lý Đa phương tiện)
- **Tối ưu Băng thông**: Khi có Image/File, hệ thống KHÔNG tải xuống lập tức.
- **On-demand Download**: Chỉ khi cần mô tả, hệ thống gọi `downloadMessageFile` lưu tạm ra thư mục `/tmp/`.
- **Phân tích (Gemini)**: Gửi file qua API Gemini để mô tả nội dung. Sau đó xóa file local để tiết kiệm bộ nhớ.

### 3. Web Context Resolution (Search Decision Tree)
1. **Kiểm tra Catch Cứng (Fast Path)**: Các câu hỏi giờ giấc / ngày tháng hiện tại sẽ bỏ qua API, dùng code JS xuất kết quả.
2. **Kiểm tra URL Scraping**: Cào nội dung link người dùng gửi.
3. **Phân lớp Tìm kiếm**:
   - Nếu câu hỏi thuộc mảng (News/Finance) -> Ưu tiên Tavily (ưu tiên miền Việt Nam cho từ khoá nội địa).
   - Nếu câu hỏi mảng (Dev/Social) -> Ưu tiên Exa.
4. **Giới hạn & Fail-safe**: Nếu Tavily bị rate limit (429), fallback sang Exa (hoặc ngược lại). Quản lý Quota của Exa thông qua biến đếm (max 950) trong Firestore.

### 4. DeepSeek Chat function (Tool Calling / ReAct)
- Hệ thống hỗ trợ "Tool Calling" qua DSML.
- **Vòng lặp ReAct**: 
  - Gửi Prompt. Nếu DeepSeek tự động gọi tool `google_search` -> Thực thi.
  - Sau khi lấy kết quả search, bơm lại vào context, LLM phân tích và trả về câu trả lời cuối. (Giới hạn tối đa 2 lần gọi lặp để tránh infinite loop & chi phí cao).

### 5. MasterScheduler (Cron tasks)
Chạy bằng Cloud Scheduler (định kỳ):
- Dọn dẹp cache `processedWebhooks`, `active_sessions`.
- Xử lý các lịch hẹn đã đến hạn (`getDueSchedules()`) và xóa lịch trình rác.
- Gửi Daily News Digest (Sáng / Chiều).
- Kích hoạt tính năng Nén trí nhớ & Audit lịch sử từ Gemini.

### 6. Hybrid Memory (3 tầng RAM/RTDB/Firestore)
Hệ thống kết hợp 3 tầng dữ liệu để tối ưu tốc độ và chi phí:
- **Tầng L1 (RAM Cache - 5 phút)**: Chứa các cấu hình bot (botConfig), User Profiles, Metadata phòng chat (hot topic), WebContext Cache.
- **Tầng L2 (Firebase RTDB)**: Lưu tin nhắn thô, Lịch hẹn (Schedules), Facts (Global/User Index) vì không mất phí ghi dữ liệu (Write).
- **Tầng L3 (Firestore)**: Lưu vĩnh viễn Hồ sơ người dùng (đã nén), Nhật ký lỗi (Audit Logs - giữ 30 ngày), Cấu hình động.

---

## Các logic hỗ trợ đặc biệt

- **Profile Extraction**: Tự động bóc tách và phân loại tính cách, giới tính, tên thật thông qua thẻ `<PROFILE>`. Cập nhật ngầm bằng LLM và lưu vào Firestore.
- **Auto-Topic Sync**: Tự động bắt thẻ `<TOPIC>` và lưu vào `hotTopic` trên RTDB, giúp bot biết trọng tâm câu chuyện hiện tại.
- **Mention Resolution**: 
  - LINE: Tự động đổi `@tên` thành `{user_X}` và gán `substitution` trong `textV2`.
  - Telegram: Tự động đổi `@tên` thành `<a href="tg://user?id=X">tên</a>`.
- **Global Fact Approval**: Thành viên tạo `<FACT>` mới sẽ được gửi về Telegram Admin (qua dạng Pending) với Inline Keyboard. Admin bấm Duyệt (✅) để push vào Global Facts Index, mọi nhóm khác đều có thể truy vấn.
- **Whitelist**: Cấu hình kiểm soát phân quyền (`ALLOWED_LINE_USERS`, `ALLOWED_TELEGRAM_USERS`), có thể dùng `*` để mở công khai.

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
    "users": {
      "user_123": {
        "index": { ... }, "detail": { ... }
      }
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
  /{userId} (Lưu trữ: real_name, gender, public_traits, private_traits, rules, Core_Memory)

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
| `API_KEY` | Key giao tiếp với AI Gemini (Multimodal/Summarize). |
| `LLM_PROVIDER` | Phân luồng mặc định (`DEEPSEEK` hoặc `GEMINI`). |
| `TAVILY_API_KEY` | Key gọi Search API (News/General). |
| `EXA_API_KEY` | Key gọi Search API (Dev/Social, max 950 queries/month). |
| `CHANNEL_ACCESS_TOKEN` | Token kết nối LINE Messaging API. |
| `TELEGRAM_BOT_TOKEN` | Token kết nối Telegram Bot API. |
| `TELEGRAM_BOT_USERNAME` | Tên người dùng của Bot trên Telegram (Dùng để kiểm tra tag). |
| `TELEGRAM_SECRET_TOKEN` | Khóa bảo mật xác thực Webhook của Telegram. |
| `TELEGRAM_ADMIN_APPPROVAL_ID`| Chat ID của Admin duyệt Global Facts hoặc cấu hình hệ thống. |
