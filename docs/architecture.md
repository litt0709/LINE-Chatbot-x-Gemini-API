# 🏗️ Kiến Trúc Hệ Thống: LINE & Telegram AI Chatbot
> **Cập nhật:** Lần cuối vào ngày 31/07/2026

Hệ thống được thiết kế theo hướng **Serverless** trên Google Cloud Platform (Firebase Cloud Functions), tập trung tối đa vào tốc độ phản hồi, tiết kiệm chi phí Token/Database và khả năng mở rộng (Multi-platform).

---

## 1. Phân Lớp Kiến Trúc (Architecture Layers)

| Lớp (Layer) | Công nghệ / File chịu trách nhiệm | Chức năng chính |
| :--- | :--- | :--- |
| **Request Layer** | Firebase Functions (`index.js`), `line.js`, `telegram.js` | Hứng Webhook từ LINE/Telegram, Parse sự kiện, Xác thực chữ ký. Băm nhỏ tin nhắn (Message Chunking) chống sập Telegram API. Xử lý LINE TextV2 (mentions & postback). Làm sạch XML Tags tàn dư trước khi gửi phản hồi. |
| **Processing Layer** | `index.js` | Điều phối logic: Whitelist, Context Builder. Lọc chống lộ prompt bằng `leak_blacklist.json`. Hỗ trợ luồng hỏi thời gian thuần túy (Fast Path). Định tuyến luồng Audit & Cleanup tự động (`cleanup_audit.js`, `cleanup_update.js`). |
| **LLM Layer** | `llm.js`, `deepseek.js`, `gemini.js` | LLM Router điều phối. DeepSeek-V4-Flash (Chat chính, Cấu trúc tag, Smart Search Query, Post-processing xóa câu hỏi ngược). Gemini-2.5-Flash (Phân tích ảnh/tài liệu đa phương thức, Tạo Audit Logs JSON). Offline Guardrails ngắt mạch API khi thiếu Web Context. |
| **Search Layer** | `search.js`, `tavily.js`, `exa.js` | Định tuyến tìm kiếm. Tavily và Exa. Tích hợp Firewall chặn Web Scraping các nền tảng mạng xã hội (X/Twitter). Dùng Regex động tự phân loại (NEWS, FINANCE, DEV, SOCIAL, STANDALONE_TOPICS). |
| **Storage Layer** | `db.js` (RTDB, Firestore, RAM Cache) | Hệ thống Hybrid Memory 3 tầng: RAM (Siêu tốc), RTDB (Ngắn hạn), Firestore (Dài hạn). Cung cấp Firestore API cho audit workflow độc lập. |

---

## 2. Sơ Đồ Kiến Trúc Tổng Thể (ASCII Art)

```text
       [Telegram App]             [LINE App]
             |                        |
             +-----------+------------+
                         |
                         v
             +------------------------+
             | Firebase Cloud Function| (index.js - webhook)
             +-----------+------------+
                         |
                         v
             +------------------------+
             |    Processing Layer    | (Whitelist, Context Builder, Scrubbing)
             +-----------+------------+
                         |
      +------------------+------------------+
      |                  |                  |
      v                  v                  v
+-----------+     +-------------+    +---------------+
| LLM Layer |<--->| Search Layer|<-->| Storage Layer |
+-----------+     +-------------+    +---------------+
 (Offline           (Tavily, Exa,       (RTDB, Firestore,
 Guardrails,         Scraping,          RAM Cache)
 DeepSeek,           Firewall)
 Gemini)
```

---

## 3. Data Flow Sơ Đồ Chat (Text Workflow)

```text
User ──> [Webhook] ──> Lọc Blacklist & Fast Path (hỏi giờ/ngày)
                             │
                             v
                    Kiểm tra Cache RAM (Lấy Profile User siêu tốc)
                             │
                             v
                    Xây dựng Ngữ cảnh (Ghim chủ đề & Bơm Facts/Profile từ RTDB/RAM)
                             │
                             v
                    Search Router (Trích xuất từ khóa, quyết định Search)
                    ├── Có ──> Kiểm tra URL bằng Firewall ──> Gọi API / Scrape
                    └── Không ─> Tiếp tục
                             │
                             v
                    Kiểm tra Offline Guardrails (Chống Hallucination)
                    ├── Thỏa mãn (News/Fact-check KHÔNG có webContext) ──> Trả text "Không biết" (Ngắt mạch)
                    └── Không thỏa mãn ──> Gộp Context gửi lên LLM Router
                             │
                             v
                    Nhận chuỗi trả về từ LLM (DeepSeek/Gemini)
                             │
                             v
                    Post-processing (Regex dọn sạch câu hỏi ngược đối với task Tóm tắt)
                             │
                             v
                    Trích xuất XML Tags linh hoạt (Regex getAttr)
                    ├── <PROFILE> ──> Update RAM & Firestore (Tên, giới tính, đặc điểm)
                    ├── <FACT>    ──> Lưu Pending RTDB & Gửi Telegram duyệt
                    ├── <Task>    ──> Tạo QuickReply (LINE) / Inline Keyboard (Telegram)
                    └── <REACT>   ──> Validate Emoji ──> API Reaction (Telegram)
                             │
                             v
                    Xóa các XML tags ẩn, format mentions, làm sạch chuỗi (Telegram / LINE textV2)
                             │
                             v
                    Chunking (Telegram MAX_LEN=2000) ──> Gửi API trả lời
                             │
                             v
                    Lưu lịch sử chat vào RTDB (Bất đồng bộ)
```

---

## 4. Tối Ưu Hóa Chi Phí & Bảo Mật Hệ Thống (Cost & Security Matrix)

| Hành động / Sự cố | Biện pháp Tối ưu / Khắc phục | Mức phí dự kiến |
| :--- | :--- | :--- |
| **LLM Model Cost** | Chuyển từ deepseek-chat sang `deepseek-v4-flash` rẻ hơn, tốc độ phản hồi siêu việt. | Tối thiểu phí Token |
| **Hallucination Prevention** | Sử dụng **Offline Guardrails** (Regex check) ngắt mạch không gọi LLM nếu thiếu Web Context cho các sự kiện thời sự/fact-check. | 0đ (Tiết kiệm 100% token) |
| **Bảo vệ Prompt** | Chặn dò hỏi (Prompt Leakage) qua `leak_blacklist.json` tại tầng Webhook. | 0đ |
| **Chống Scraping lỗi** | Firewall tại Search Layer tự động chặn đọc link X/Twitter, ngăn LLM bị nhiễu do JS rác. | Tối ưu thời gian & token |
| **Hybrid Memory** | Quản lý bộ nhớ RAM cho Profile, Facts Index và Web Context. Cache Web Context 5 phút. | Tối thiểu phí đọc DB |
| **Đọc Lịch sử Chat** | Dùng Realtime Database (RTDB) lấy tin nhắn thô. Cực rẻ, độ trễ thấp hơn Firestore. | ~0.0001đ / tin nhắn |
| **Quản lý Rác Logs** | Hai luồng cron thủ công `/audit` và `/update` có script cleanup độc lập, tự động xóa DB sau khi hoàn tất. | Miễn phí |

---

## 5. Môi Trường Triển Khai (Environments)

| Tên Bot | Project ID GCP | Trạng thái | Nền tảng |
| :--- | :--- | :--- | :--- |
| LINE Bot | `line-ai-chatbot-eab18` | Active | Node.js 22 (2nd Gen) |
| Telegram Bot | `tele-ai-chatbot` | Active | Node.js 22 (2nd Gen) |
