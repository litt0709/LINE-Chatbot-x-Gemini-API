# 🏗️ Kiến Trúc Hệ Thống: LINE & Telegram AI Chatbot
> **Cập nhật:** Lần cuối vào ngày 12/07/2026

Hệ thống được thiết kế theo hướng **Serverless** trên Google Cloud Platform (Firebase Cloud Functions), tập trung tối đa vào tốc độ phản hồi, tiết kiệm chi phí Token/Database và khả năng mở rộng (Multi-platform).

---

## 1. Phân Lớp Kiến Trúc (Architecture Layers)

| Lớp (Layer) | Công nghệ / File chịu trách nhiệm | Chức năng chính |
| :--- | :--- | :--- |
| **Request Layer** | Firebase Functions (`index.js`), `line.js`, `telegram.js` | Hứng Webhook từ LINE/Telegram, Parse sự kiện, Xác thực chữ ký. Băm nhỏ tin nhắn (Message Chunking) chống sập Telegram API. |
| **Processing Layer** | `index.js` | Điều phối logic chính: Kiểm tra Whitelist, Xử lý lệnh, Phân giải Context (Quote, Mention), Phân tích Profile/Reaction. Fallback kiểm tra Emoji Reaction tránh lỗi 400. |
| **LLM Layer** | `deepseek.js`, `gemini.js`, `llm.js` | Xử lý ngôn ngữ: DeepSeek (Chat chính, Reasoning), Gemini (Phân tích ảnh/tài liệu, Tóm tắt ngữ cảnh). |
| **Search Layer** | `search.js`, `tavily.js`, `exa.js` | Quyết định có cần Search không. Gọi Tavily (Tin tức, General) hoặc Exa (Mạng xã hội, Chuyên sâu). |
| **Storage Layer** | `db.js` (RTDB, Firestore, RAM Cache) | Lưu trữ ngữ cảnh. RTDB (Lịch sử ngắn hạn), Firestore (Hồ sơ user dài hạn), RAM Cache (Siêu tốc). |

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
User ──> [Webhook] ──> Kiểm tra Whitelist (Từ chối nếu vi phạm)
                             │
                             v
                    Kiểm tra Cache RAM (Lấy Profile User siêu tốc)
                             │
                             v
                    Xây dựng Ngữ cảnh (Tier 1 hoặc Tier 2 Context Injection)
                             │
                             v
                    Search Router (Phân tích xem câu hỏi có cần data mới không)
                    ├── Có ──> Gọi API Tavily/Exa lấy dữ liệu
                    └── Không ─> Tiếp tục
                             │
                             v
                    Gộp Context gửi lên LLM (DeepSeek)
                             │
                             v
                    Nhận chuỗi trả về từ LLM
                             │
                             v
                    Trích xuất Tag ẩn (<PROFILE> và <REACT>)
                    ├── <PROFILE> ──> Update RAM & Firestore (Background)
                    └── <REACT>   ──> Validate với mảng 73 emoji (Fallback nếu lỗi) ──> Gửi API Reaction (Chỉ Telegram)
                             │
                             v
                    Xóa tag ẩn, gửi Text thuần về cho User
                             │
                             v
                    Băm tin nhắn (Chunking MAX_LEN = 2000) chống vượt giới hạn API
                             │
                             v
                    Gửi chuỗi Chunk tuần tự lên Telegram / LINE
                             │
                             v
                    Lưu lịch sử chat vào RTDB (Bất đồng bộ)
```

---

## 4. Tối Ưu Hóa Chi Phí & Bảo Mật Hệ Thống (Cost & Security Matrix)

| Hành động / Sự cố | Biện pháp Tối ưu / Khắc phục | Mức phí dự kiến |
| :--- | :--- | :--- |
| **Đọc Profile User** | Dùng Map `userProfileCache` trên RAM. Chỉ lấy Firestore 1 lần khi cold start. | Gần như 0đ (Firestore Read) |
| **Lưu Profile User** | Chỉ cập nhật Firestore khi thực sự có thay đổi (via `<PROFILE>` tag). | Cực thấp |
| **Đọc Lịch sử Chat** | Dùng Realtime Database (RTDB) lấy 50 dòng cuối. Rẻ hơn Firestore rất nhiều. | ~0.0001đ / tin nhắn |
| **Gửi Profile vào Prompt**| Phân tầng: Tier 1 (chỉ Tên+Giới tính) cho chat phím. Tier 2 (Full Traits) khi có trigger. | Giảm 90% lượng token rác |
| **Reaction Emoji** | LLM chèn tag. Cắt ngắn Prompt xuống 13 chữ để giảm Token. | Zero Cost (0 API call phụ) |
| **Lỗi 400 Reaction** | Validate mảng 73 Emoji. Fallback sang "❤" nếu LLM hallucinate. | Tránh chết API |
| **Lỗi tin nhắn quá dài** | Băm nhỏ tin nhắn (MAX_LEN = 2000) và render HTML từng đoạn. | Tránh sập Telegram |

---

## 5. Môi Trường Triển Khai (Environments)

| Tên Bot | Project ID GCP | Trạng thái | Nền tảng |
| :--- | :--- | :--- | :--- |
| LINE Bot | `line-ai-chatbot-eab18` | Active | Node.js 22 (2nd Gen) |
| Telegram Bot | `tele-ai-chatbot` | Active | Node.js 22 (2nd Gen) |
