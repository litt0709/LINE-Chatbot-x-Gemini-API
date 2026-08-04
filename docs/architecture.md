# Kiến trúc tổng thể hệ thống (Architecture)
_Cập nhật lần cuối: 2026-08-04_

## Sơ đồ Kiến trúc (Architecture Diagram)

```text
+-----------------------------------------------------------------+
|                         USER (LINE / Telegram)                  |
+-----------------------------------------------------------------+
                                | (Webhook API)
                                v
+-----------------------------------------------------------------+
|                       REQUEST LAYER (index.js)                  |
| - Validation (Secret Token)                                     |
| - Idempotency Cache (processedWebhooks, max 1000)               |
| - Prompt Leakage Filter (leak_blacklist.json)                   |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                     PROCESSING LAYER (index.js)                 |
| - Parse Text, Media, Event                                      |
| - Smart Group Chat (Focus Mode, Proactive Check, isSummary)     |
| - Action Tag Parser (<PROFILE>, <FACT>, <SCHEDULE>, <REACT>...) |
| - Mention Resolution (textV2 for LINE, HTML for Telegram)       |
| - MasterScheduler (Cron tasks)                                  |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|       LLM LAYER (llm.js -> deepseek.js / gemini.js / news.js)   |
| - System Prompt Builder (Brevity, Dynamic Config, Core Memory)  |
| - Gemini 2.5 Flash (Multimodal, analyzeDocument, Audit/Summary) |
| - DeepSeek V4 Flash (Text Chat, Reasoning, Tool Calling/ReAct)  |
+-----------------------------------------------------------------+
               |                               |
               v                               v
+--------------------------+    +---------------------------------+
|      SEARCH LAYER        |    |       STORAGE LAYER (db.js)     |
| (search.js)              |    | - Firestore: User Profiles,     |
| - Regex Extractor        |    |   Audit Logs, Configs, Quotas   |
| - Web Scraper (scrapeUrl)|    | - RTDB: Messages, Metadata,     |
| - Tavily API (tavily.js) |    |   Schedules, Facts, Active      |
| - Exa API (exa.js)       |    | - RAM Cache: Profile, Facts,    |
+--------------------------+    |   Metadata, WebContext          |
                                +---------------------------------+
```

## Bảng phân lớp kiến trúc

| Lớp (Layer) | Chức năng chính | Các File liên quan |
|---|---|---|
| **Request Layer** | Nhận Request, kiểm tra Secret Token (Telegram), lọc trùng lặp Webhook, chặn Prompt Leakage. | `index.js` |
| **Processing Layer** | Điều phối luồng, bóc tách thẻ HTML (Action Tags), quản lý tính năng nhóm, xử lý Mention, kiểm duyệt Admin (Duyệt Facts). | `index.js` |
| **LLM Layer** | Logic tương tác AI, phân bổ tải giữa DeepSeek (Chat) và Gemini (Ảnh, Tài liệu, Nén bộ nhớ, Audit). | `llm.js`, `deepseek.js`, `gemini.js`, `news.js` |
| **Search Layer** | Truy xuất thông tin thời gian thực từ mạng Internet, phân loại (NEWS, DEV, SOCIAL, FINANCE) để chọn API (Tavily/Exa). | `search.js`, `tavily.js`, `exa.js` |
| **Storage Layer** | Lưu trữ đa tầng (RAM -> RTDB -> Firestore) tối ưu tốc độ đọc và chi phí ghi dữ liệu. | `db.js` |

## Sơ đồ luồng dữ liệu (Data Flow khi Chat)

```text
User gửi tin nhắn
   |
   +-> 1. index.js: Xác thực & kiểm tra Idempotency
   |
   +-> 2. Tải Bot Config (Firestore -> RAM) & User/Group Profile (Firestore/RTDB -> RAM)
   |
   +-> 3. Lọc Prompt Leakage
   |
   +-> 4. search.js: Phát hiện nhu cầu tìm kiếm (Offline check)
   |      +-> Nếu CÓ: Cào Web / Tavily / Exa -> Trả về WebContext (Lưu cache RTDB 5 phút)
   |
   +-> 5. Tìm kiếm Facts liên quan trong Cache
   |
   +-> 6. deepseek.js: Ghép System Prompt (Brevity Rule, Context, Facts, WebContext)
   |      +-> Gọi API DeepSeek (Hỗ trợ Tool Call ReAct tối đa 2 lượt)
   |
   +-> 7. Trả về Text -> index.js parse các thẻ (<PROFILE>, <FACT>, <SCHEDULE>...)
   |
   +-> 8. Xử lý Mention (LINE textV2, Telegram HTML) & Băm nhỏ tin nhắn
   |
   +-> 9. Gửi tin qua line.js / telegram.js
   |
   +-> 10. Lưu tin nhắn vào RTDB
```

## Bảng chi phí theo hành động

Hệ thống được thiết kế tối ưu cực đoan về chi phí (Cost-effective):

| Hành động / Dữ liệu | Giải pháp lưu trữ / API | Đánh giá Chi phí |
|---|---|---|
| **Tin nhắn trò chuyện thô** | Firebase RTDB (Realtime Database) | **Free/Rất rẻ** (Không tính phí Write document) |
| **Hồ sơ Người dùng (Profile)** | RAM Cache (L1) -> Firestore (L2) | **Rẻ** (Chỉ ghi khi có thay đổi thực sự qua `<PROFILE>`) |
| **Cấu hình Bot (botConfig)** | RAM Cache (L1) -> Firestore (L2) | **Gần như Free** (Cache RAM sống theo chu kỳ func) |
| **Facts (Kiến thức tự học)** | RAM Cache (L1) -> RTDB (L2) | **Rất rẻ** (Lưu cấu trúc JSON trong RTDB) |
| **Schedules (Lịch hẹn)** | RTDB | **Rất rẻ** |
| **Lọc WebContext/Search** | RAM Cache -> RTDB (Cache 5p) | **Tiết kiệm API calls** (Tránh gọi Search API nhiều lần) |
| **Audit Logs (Lịch sử lỗi)** | Firestore (Xóa bằng MasterScheduler) | **Có phí** (Ghi mỗi khi Gemini phát hiện issue, xóa tự động) |
| **Chat Text API** | DeepSeek V4 Flash | **Siêu rẻ** (Giảm chi phí LLM so với GPT-4/Claude) |
| **Vision / Summary API** | Gemini 2.5 Flash | **Free/Rẻ** (Dùng tài khoản Google AI Studio miễn phí/rẻ) |
| **Search API (Tavily)** | Tavily API | **Free Tier** (1000 requests/tháng) |
| **Search API (Exa)** | Exa API (Có Firestore quota tracker) | **Free Tier** (Max 950 requests/tháng, hard limit tại `exa_usage`) |

## Môi trường Triển khai

- **Nền tảng**: Firebase Cloud Functions (Node.js 22, 2nd Gen)
- **Vùng (Region)**: `us-central1`
- **Webhook URL**: `https://webhook-wsokmtbtsq-uc.a.run.app`
- **Tài nguyên**: Cấu hình bộ nhớ `256MiB`, `maxInstances: 10`, timeout `300s`.
