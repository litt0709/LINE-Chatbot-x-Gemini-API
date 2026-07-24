# 🏗️ Kiến Trúc Hệ Thống: LINE & Telegram AI Chatbot
> **Cập nhật:** Lần cuối vào ngày 24/07/2026

Hệ thống được thiết kế theo hướng **Serverless** trên Google Cloud Platform (Firebase Cloud Functions), tập trung tối đa vào tốc độ phản hồi, tiết kiệm chi phí Token/Database và khả năng mở rộng (Multi-platform).

---

## 1. Phân Lớp Kiến Trúc (Architecture Layers)

| Lớp (Layer) | Công nghệ / File chịu trách nhiệm | Chức năng chính |
| :--- | :--- | :--- |
| **Request Layer** | Firebase Functions (`index.js`), `line.js`, `telegram.js` | Hứng Webhook từ LINE/Telegram, Parse sự kiện, Xác thực chữ ký. Băm nhỏ tin nhắn (Message Chunking) chống sập Telegram API. Xử lý LINE TextV2 (mentions & postback). Duyệt Global Fact qua Telegram Inline Keyboard. |
| **Processing Layer** | `index.js` | Điều phối logic: Whitelist, Context Builder (ghim chủ đề, bù đắp câu lệnh ngắn), Phân tích Profile/Reaction/Fact Tag. Lọc chống lộ prompt bằng `leak_blacklist.json`. Hỗ trợ luồng hỏi thời gian thuần túy (Fast Path). |
| **LLM Layer** | `deepseek.js`, `gemini.js`, `llm.js` | Xử lý ngôn ngữ: DeepSeek (Chat chính, Cấu trúc tag, Smart Search Query), Gemini (Phân tích ảnh/tài liệu đa phương thức, Tóm tắt ngữ cảnh, Tạo Audit Logs JSON). |
| **Search Layer** | `search.js`, `tavily.js`, `exa.js` | Định tuyến tìm kiếm. Tavily (Tin nóng VN/Quốc tế, dựa trên `trusted_sources.json`) và Exa (Chuyên sâu, Giới hạn quota qua Firestore). Xử lý scrape web trực tiếp khi gửi URL. |
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
                    Gộp Context gửi lên LLM (DeepSeek)
                             │
                             v
                    Nhận chuỗi trả về từ LLM
                             │
                             v
                    Trích xuất XML Tags (<PROFILE>, <FACT>, <REACT>, <Task>)
                    ├── <PROFILE> ──> Update RAM & Firestore
                    ├── <FACT>    ──> Lưu Pending RTDB & Gửi Telegram duyệt
                    ├── <Task>    ──> Tạo QuickReply (LINE) / Inline Keyboard (Telegram)
                    └── <REACT>   ──> Validate 73 Emoji ──> API Reaction (Telegram)
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
| **Bảo vệ Prompt** | Chặn các câu lệnh dò hỏi (Prompt Leakage) thông qua bộ lọc `leak_blacklist.json` ở tầng Webhook. | 0đ |
| **Hybrid Memory** | Quản lý bộ nhớ RAM cho Profile, Facts Index và Web Context. Cache Web Context 5 phút. | Tối thiểu phí đọc DB |
| **Đọc Lịch sử Chat** | Dùng Realtime Database (RTDB) lấy 50 dòng cuối. Cực rẻ và độ trễ thấp hơn Firestore. | ~0.0001đ / tin nhắn |
| **Exa Search Quota** | Quản lý cứng giới hạn `EXA_MONTHLY_LIMIT = 950` request/tháng trên Firestore. Fallback nếu quá tải. | Chống vượt phí API |
| **Smart Search Query** | LLM tự bù đắp nội dung dựa trên câu chủ đề trước đó (Ghim chủ đề) để sinh query ngắn, trúng đích. | Tối ưu Token LLM |
| **Reaction Emoji** | Chèn `<REACT>` XML tag, fallback `❤` nếu bịa emoji lạ tránh lỗi 400. | Zero Cost API phụ |
| **Băm tin nhắn** | Chia nhỏ tin nhắn dài thành từng khối <2000 ký tự cho Telegram. | Tránh lỗi sập API |

---

## 5. Môi Trường Triển Khai (Environments)

| Tên Bot | Project ID GCP | Trạng thái | Nền tảng |
| :--- | :--- | :--- | :--- |
| LINE Bot | `line-ai-chatbot-eab18` | Active | Node.js 22 (2nd Gen) |
| Telegram Bot | `tele-ai-chatbot` | Active | Node.js 22 (2nd Gen) |
