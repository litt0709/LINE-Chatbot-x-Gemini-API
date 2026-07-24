# 🏗️ Kiến Trúc Hệ Thống: LINE & Telegram AI Chatbot
> **Cập nhật:** Lần cuối vào ngày 25/07/2026

Hệ thống được thiết kế theo hướng **Serverless** trên Google Cloud Platform (Firebase Cloud Functions), tập trung tối đa vào tốc độ phản hồi, tiết kiệm chi phí Token/Database và khả năng mở rộng (Multi-platform).

---

## 1. Phân Lớp Kiến Trúc (Architecture Layers)

| Lớp (Layer) | Công nghệ / File chịu trách nhiệm | Chức năng chính |
| :--- | :--- | :--- |
| **Request Layer** | Firebase Functions (`index.js`), `line.js`, `telegram.js` | Hứng Webhook từ LINE/Telegram, Parse sự kiện, Xác thực chữ ký. Băm nhỏ tin nhắn (Message Chunking) chống sập Telegram API. Xử lý LINE TextV2 (mentions & postback). Duyệt Global Fact qua Telegram Inline Keyboard. |
| **Processing Layer** | `index.js` | Điều phối logic: Whitelist, Context Builder (ghim chủ đề, bù đắp câu lệnh ngắn), Phân tích XML tags (Profile/Fact/React/Task). Lọc chống lộ prompt bằng `leak_blacklist.json`. Hỗ trợ luồng hỏi thời gian thuần túy (Fast Path). |
| **LLM Layer** | `llm.js`, `deepseek.js`, `gemini.js` | LLM Router điều phối. DeepSeek-V4-Flash (Chat chính, Cấu trúc tag, Smart Search Query), Gemini-2.5-Flash (Phân tích ảnh/tài liệu đa phương thức, Tóm tắt ngữ cảnh, Tạo Audit Logs JSON). |
| **Search Layer** | `search.js`, `tavily.js`, `exa.js` | Định tuyến tìm kiếm. Tavily (Tin nóng VN/Quốc tế) và Exa (Chuyên sâu, quản lý quota). Xử lý scrape web trực tiếp khi gửi URL. Dùng Regex để tự động map từ khóa vào danh mục (NEWS, FINANCE, DEV, SOCIAL). |
| **Storage Layer** | `db.js` (RTDB, Firestore, RAM Cache) | Hệ thống Hybrid Memory 3 tầng: Tầng RAM (Siêu tốc: Profile, Facts Index), Tầng RTDB (Ngắn hạn: Tin nhắn thô, Metadata, Facts Detail, Pending Facts), Tầng Firestore (Dài hạn: User Profiles, Quota, Audit Logs). |

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
             |    Processing Layer    | (Whitelist, Context Builder, Extractors)
             +-----------+------------+
                         |
      +------------------+------------------+
      |                  |                  |
      v                  v                  v
+-----------+     +-------------+    +---------------+
| LLM Layer |<--->| Search Layer|<-->| Storage Layer |
+-----------+     +-------------+    +---------------+
 (DeepSeek,         (Tavily, Exa,       (RTDB, Firestore,
  Gemini)           News Digest)         RAM Cache)
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
                    ├── Có ──> Gọi API Tavily/Exa / Scrape URL (Có Quota limit)
                    └── Không ─> Tiếp tục
                             │
                             v
                    Gộp Context gửi lên LLM Router (DeepSeek/Gemini)
                             │
                             v
                    Nhận chuỗi trả về từ LLM
                             │
                             v
                    Trích xuất XML Tags linh hoạt (Regex getAttr)
                    ├── <PROFILE> ──> Update RAM & Firestore (Tên, giới tính, đặc điểm)
                    ├── <FACT>    ──> Lưu Pending RTDB & Gửi Telegram duyệt
                    ├── <Task>    ──> Tạo QuickReply (LINE) / Inline Keyboard (Telegram)
                    └── <REACT>   ──> Validate Emoji ──> API Reaction (Telegram)
                             │
                             v
                    Xóa các XML tags ẩn, format mentions (Telegram / LINE textV2)
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
| **Bảo vệ Prompt** | Chặn dò hỏi (Prompt Leakage) qua `leak_blacklist.json` tại tầng Webhook. | 0đ |
| **Hybrid Memory** | Quản lý bộ nhớ RAM cho Profile, Facts Index và Web Context. Cache Web Context 5 phút. | Tối thiểu phí đọc DB |
| **Đọc Lịch sử Chat** | Dùng Realtime Database (RTDB) lấy tin nhắn thô. Cực rẻ, độ trễ thấp hơn Firestore. | ~0.0001đ / tin nhắn |
| **Smart Search Query** | LLM tự bù đắp nội dung dựa trên chủ đề ghim để sinh query ngắn, trúng đích. | Tối ưu Token LLM |
| **Reaction Emoji** | Chèn `<REACT>` XML tag linh hoạt, fallback khi bịa emoji lạ tránh lỗi 400. | 0đ (API phụ) |
| **Tối ưu Tag Parsing** | Regex bóc tách thuộc tính thẻ XML động (như `<FACT>`, `<PROFILE>`), triệt tiêu lỗi thiếu không gian/nhầm nháy. | Tăng độ ổn định |

---

## 5. Môi Trường Triển Khai (Environments)

| Tên Bot | Project ID GCP | Trạng thái | Nền tảng |
| :--- | :--- | :--- | :--- |
| LINE Bot | `line-ai-chatbot-eab18` | Active | Node.js 22 (2nd Gen) |
| Telegram Bot | `tele-ai-chatbot` | Active | Node.js 22 (2nd Gen) |
