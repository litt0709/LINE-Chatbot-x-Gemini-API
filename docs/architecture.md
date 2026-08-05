# Kiến trúc tổng thể hệ thống (Architecture)
_Cập nhật lần cuối: 2026-08-05_

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
| - ASCII Art Generator (figlet)                                  |
| - Lệnh nội bộ (Report Cross-Platform)                           |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                     PROCESSING LAYER (index.js)                 |
| - Parse Text, Media, Event, Lệnh /report                        |
| - EQ Empathy Analysis (Emoji/Sticker -> Emotion Injection)      |
| - Action Tag Parser (<PROFILE>, <FACT>, <SCHEDULE>, <REACT>...) |
| - Strict Mention Resolution (Word Boundary Matching)            |
| - Chặn File PDF/Media > 5MB bảo vệ tài nguyên                   |
| - MasterScheduler (Idempotency RTDB state & Đa nền tảng)        |
+-----------------------------------------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|       LLM LAYER (llm.js -> deepseek.js / gemini.js / news.js)   |
| - System Prompt Builder (Dynamic Rules, RAG Skill Vectors, MBTI)|
| - Gemini 3.0 Flash (Multimodal, LTM Compression, Audit Logs)    |
| - DeepSeek (Dual-Process: V4 Flash / V4 Pro + Auto-Retry)       |
+-----------------------------------------------------------------+
               |                               |
               v                               v
+--------------------------+    +---------------------------------+
|      SEARCH LAYER        |    |       STORAGE LAYER (db.js)     |
| (search.js)              |    | - Firestore: User Profiles      |
| - Regex Extractor        |    |   (JSON LTM, MBTI, Skills)      |
| - Bắt Link PDF (>5MB)    |    | - RTDB: Messages, Metadata,     |
| - Web Scraper (scrapeUrl)|    |   Schedules, Facts, State       |
| - Tavily API (tavily.js) |    | - RAM Cache: Profile, Facts,    |
| - Exa API (exa.js)       |    |   Metadata, WebContext          |
+--------------------------+    +---------------------------------+
```

## Bảng phân lớp kiến trúc

| Lớp (Layer) | Chức năng chính | Các File liên quan |
|---|---|---|
| **Request Layer** | Nhận Request, kiểm tra Token, xử lý lệnh `/report` đa nền tảng, lọc trùng lặp Webhook, chặn Prompt Leakage, sinh ASCII Art. | `index.js`, `commands/report.js` |
| **Processing Layer** | Điều phối luồng, bóc tách Action Tags, chặn File/PDF >5MB, trích xuất cảm xúc (EQ), xử lý Strict Mention, định tuyến Cron Jobs (kèm Idempotency lock). | `index.js` |
| **LLM Layer** | Tương tác AI, định tuyến (Dual-Process) giữa V4-Flash/V4-Pro. Gemini dùng File API phân tích PDF/Ảnh và nén bộ nhớ (LTM, MBTI). | `llm.js`, `deepseek.js`, `gemini.js`, `news.js` |
| **Search Layer** | Truy xuất thông tin thời gian thực, tải PDF Buffer từ Link, phân loại (NEWS, DEV, SOCIAL, FINANCE) để chọn API (Tavily/Exa). | `search.js`, `tavily.js`, `exa.js` |
| **Storage Layer** | Lưu trữ đa tầng (RAM -> RTDB -> Firestore). Firestore lưu JSON Core Memory, MBTI Profile. Lưu System State của Scheduler. | `db.js` |

## Sơ đồ luồng dữ liệu (Data Flow khi Chat)

```text
User gửi tin nhắn
   |
   +-> 1. index.js: Xác thực & kiểm tra Idempotency
   |      +-> [Zero-cost] Nếu lệnh `/vẽ`: Trả về luôn ASCII art qua `figlet`.
   |
   +-> 2. Tải Bot Config, User/Group Profile (JSON Core_Memory, MBTI, Skill Vectors)
   |      +-> [Tối ưu] Chỉ load Full Traits nếu User là Sender hoặc bị Mentioned (Strict Regex)
   |
   +-> 3. Lọc Prompt Leakage & Phân tích Cảm xúc (analyzeEmotion từ Emoji/Sticker)
   |
   +-> 4. search.js: Phát hiện nhu cầu tìm kiếm (Offline check)
   |      +-> Phân loại URL: Nếu là link .pdf, HEAD check <5MB -> Tải Buffer PDF -> Gọi Gemini File API.
   |      +-> Nếu URL thường: Cào Web / Tavily / Exa -> Trả về WebContext (Lưu cache RTDB)
   |
   +-> 5. Tìm kiếm Facts liên quan trong Cache
   |
   +-> 6. deepseek.js: Ghép System Prompt (Context, Persona Anchor, RAG Skills, JSON LTM)
   |      +-> Phân loại độ khó (Dual-Process Classifier)
   |      +-> Nếu Dễ: Gọi deepseek-v4-flash
   |      +-> Nếu Khó: Gọi deepseek-v4-pro
   |      +-> [Fallback/Auto-Retry]: Tự động thử lại 2 lần nếu lỗi mạng (ECONNRESET), nếu fail v4-pro thì gọi v4-flash.
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
| **Hồ sơ (LTM, MBTI, Skills)** | RAM Cache (L1) -> Firestore (L2) | **Rẻ** (Chỉ ghi khi nén JSON LTM lúc 3h sáng hoặc có `<PROFILE>`) |
| **Cấu hình Bot (botConfig)** | RAM Cache (L1) -> Firestore (L2) | **Gần như Free** (Cache RAM) |
| **Vẽ ASCII Art** | Node.js (figlet) | **Hoàn toàn Free** (Local Compute) |
| **Audit Logs (Lịch sử lỗi)** | Firestore (Xóa bằng MasterScheduler) | **Có phí** (Ghi tự động khi Gemini review ban đêm) |
| **Chat Text (System 1)** | DeepSeek V4 Flash | **Siêu rẻ** (Cho 90% giao tiếp thông thường) |
| **Chat Text (System 2)** | DeepSeek V4 Pro | **Trả phí theo usage** (Chỉ trigger cho câu hỏi phức tạp/CoT) |
| **Vision & PDF Reading** | Gemini 3.0 Flash (File API) | **Free/Rẻ** (Dùng File API đọc file dung lượng < 5MB) |
| **Search API (Tavily)** | Tavily API | **~$0.005/lượt** (Theo hạn mức gói trả phí/free tier) |
| **Search API (Exa)** | Exa API | **Free Tier** (Max 950 requests/tháng) |

## Môi trường Triển khai (Multi-Environment)

- **Nền tảng**: Firebase Cloud Functions (Node.js 22, 2nd Gen)
- **Vùng (Region)**: `us-central1`
- **LINE Project**: `line-ai-chatbot-eab18` (Webhook URL: `https://webhook-wsokmtbtsq-uc.a.run.app`)
- **Telegram Project**: `tele-ai-chatbot` (Webhook URL: `https://webhook-ephgri5wvq-uc.a.run.app`)
- **Tài nguyên**: Cấu hình bộ nhớ `256MiB`, `maxInstances: 10`, timeout `300s`.
