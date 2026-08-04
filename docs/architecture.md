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
| - EQ Empathy Analysis (Emoji/Sticker -> Emotion Injection)      |
| - Action Tag Parser (<PROFILE>, <FACT>, <SCHEDULE>, <REACT>...) |
| - Mention Resolution (textV2 for LINE, HTML for Telegram)       |
| - MasterScheduler (Cron tasks)                                  |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|       LLM LAYER (llm.js -> deepseek.js / gemini.js / news.js)   |
| - System Prompt Builder (Dynamic Rules, JSON Core Memory)       |
| - Gemini 3.0 Flash (Multimodal, LTM Compression, Audit Logs)    |
| - DeepSeek (Dual-Process: V4 Flash / Reasoner R2)               |
+-----------------------------------------------------------------+
               |                               |
               v                               v
+--------------------------+    +---------------------------------+
|      SEARCH LAYER        |    |       STORAGE LAYER (db.js)     |
| (search.js)              |    | - Firestore: User Profiles      |
| - Regex Extractor        |    |   (JSON LTM, Dynamic Rules)     |
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
| **Processing Layer** | Điều phối luồng, bóc tách Action Tags, quản lý tính năng nhóm, trích xuất cảm xúc từ Emoji (EQ Empathy), xử lý Mention. | `index.js` |
| **LLM Layer** | Tương tác AI, định tuyến (Dual-Process) giữa System 1 (Flash) và System 2 (Reasoner). Gemini nén bộ nhớ và Audit. | `llm.js`, `deepseek.js`, `gemini.js`, `news.js` |
| **Search Layer** | Truy xuất thông tin thời gian thực, phân loại (NEWS, DEV, SOCIAL, FINANCE) để chọn API (Tavily/Exa). | `search.js`, `tavily.js`, `exa.js` |
| **Storage Layer** | Lưu trữ đa tầng (RAM -> RTDB -> Firestore). Firestore lưu Cấu trúc JSON Core Memory & Dynamic Rules. | `db.js` |

## Sơ đồ luồng dữ liệu (Data Flow khi Chat)

```text
User gửi tin nhắn
   |
   +-> 1. index.js: Xác thực & kiểm tra Idempotency
   |
   +-> 2. Tải Bot Config, User/Group Profile (JSON Core_Memory, Dynamic_Rules)
   |
   +-> 3. Lọc Prompt Leakage & Phân tích Cảm xúc (analyzeEmotion từ Emoji/Sticker)
   |
   +-> 4. search.js: Phát hiện nhu cầu tìm kiếm (Offline check)
   |      +-> Cào Web / Tavily / Exa -> Trả về WebContext (Lưu cache RTDB)
   |
   +-> 5. Tìm kiếm Facts liên quan trong Cache
   |
   +-> 6. deepseek.js: Ghép System Prompt (Context, Rules, JSON LTM)
   |      +-> Phân loại độ khó (Dual-Process Classifier)
   |      +-> Nếu Dễ: Gọi deepseek-v4-flash
   |      +-> Nếu Khó: Bẻ lái sang deepseek-v4-reasoner
   |
   +-> 7. Trả về Text -> index.js parse các thẻ (<PROFILE>, <FACT>, <SCHEDULE>...)
   |
   +-> 8. Xử lý Mention & Cắt nhỏ nội dung
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
| **Hồ sơ Người dùng (Profile)** | RAM Cache (L1) -> Firestore (L2) | **Rẻ** (Chỉ ghi khi nén JSON LTM lúc 3h sáng hoặc có `<PROFILE>`) |
| **Cấu hình Bot (botConfig)** | RAM Cache (L1) -> Firestore (L2) | **Gần như Free** (Cache RAM) |
| **Facts & Schedules** | RTDB | **Rất rẻ** |
| **Audit Logs (Lịch sử lỗi)** | Firestore (Xóa bằng MasterScheduler) | **Có phí** (Ghi tự động khi Gemini review ban đêm) |
| **Chat Text (System 1)** | DeepSeek V4 Flash | **Siêu rẻ** (Cho 90% giao tiếp thông thường) |
| **Chat Text (System 2)** | DeepSeek V4 Reasoner | **Trả phí theo usage** (Chỉ trigger cho câu hỏi phức tạp/CoT) |
| **Vision / Summary API** | Gemini 3.0 Flash | **Free/Rẻ** (Dùng tài khoản Google AI Studio miễn phí/rẻ) |
| **Search API (Tavily)** | Tavily API | **Free Tier** (1000 requests/tháng) |
| **Search API (Exa)** | Exa API | **Free Tier** (Max 950 requests/tháng) |

## Môi trường Triển khai

- **Nền tảng**: Firebase Cloud Functions (Node.js 22, 2nd Gen)
- **Vùng (Region)**: `us-central1`
- **Webhook URL**: `https://webhook-wsokmtbtsq-uc.a.run.app`
- **Tài nguyên**: Cấu hình bộ nhớ `256MiB`, `maxInstances: 10`, timeout `300s`.
