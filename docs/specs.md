# 📘 Đặc Tả Kỹ Thuật (Technical Specs)
> **Cập nhật:** Lần cuối vào ngày 31/07/2026

Tài liệu này đặc tả luồng xử lý chi tiết, cấu trúc dữ liệu của RTDB/Firestore, và danh sách các module cốt lõi của dự án.

---

## 1. Tổng Quan Module (Core Modules)

| File | Chức năng chính |
| :--- | :--- |
| `index.js` | Điểm truy cập Webhook cho LINE & Telegram. Chứa `masterScheduler` xử lý cron (dọn dẹp, bản tin). Quản lý Regex parsing tags (`<PROFILE>`, `<FACT>`, `<TOPIC>`, `<REACT>`, `<Task>`). Quản lý Regex làm sạch tàn dư Tag trước khi gửi lên nền tảng. |
| `utils/db.js` | Hàm wrapper tương tác Firebase Admin (Firestore, Realtime Database) kết hợp cơ chế RAM Cache (dữ liệu tạm). |
| `utils/llm.js` | Router phân luồng linh hoạt các yêu cầu đến nhà cung cấp AI (DeepSeek, Gemini) dựa trên biến môi trường. |
| `utils/deepseek.js` | API tương tác với mô hình `deepseek-v4-flash`. Quản lý System Prompt, cơ chế ép xuất XML tags, gen smart search query, chặn Hallucination bằng Offline Guardrails, và Post-processing (cắt câu hỏi ngược). |
| `utils/gemini.js` | API xử lý đa phương thức (Ảnh, PDF, Excel) và tính năng nén lịch sử (Memory Compression) xuất ra JSON Audit log format. |
| `utils/search.js` | Nhận diện ngữ cảnh Web/Search. Tự động scrape các URLs (kết hợp Firewall chặn Scraping X/Twitter), hoặc gọi APIs tìm kiếm dựa theo phân nhóm regex khổng lồ (NEWS, FINANCE, DEV, SOCIAL). |
| `utils/line.js` & `utils/telegram.js` | SDK tự build siêu gọn gửi tin nhắn ngược về nền tảng LINE hoặc Telegram (hỗ trợ TextV2, Reply, Inline Keyboard). |

---

## 2. Luồng Xử Lý Chi Tiết (Detailed Workflows)

### 2.1. Chat Text Thường (LINE/Telegram)
- B1: Người dùng gửi tin nhắn (hoặc nhắc tên Bot trong nhóm qua `@mention` / Text_Mention entity).
- B2: Lọc qua `leak_blacklist.json`. Bỏ qua nếu có dấu hiệu hack prompt. Chuyển Fast Path trả lời ngay nếu hỏi "bây giờ là mấy giờ".
- B3: Tra cứu `user_profiles` (ưu tiên RAM Cache, fallback Firestore) để lấy tên, giới tính, public/private traits. 
- B4: Tra cứu `facts/global` và `facts/users` để bơm thêm kiến thức tùy chỉnh vào context.
- B5: Gọi `search.js` kiểm tra Regex xem nội dung có cần search thông tin thời sự mới nhất hay không. (Firewall có thể chặn URL rác ở bước này).
- B6: **[Offline Guardrails]** Nếu request là hỏi tin tức/sự kiện mà Search Engine báo rỗng (`!webContext`), trả về `Không biết` ngay tại Code Logic, **ngắt mạch** không gọi LLM để chống bịa đặt.
- B7: Tổng hợp Prompt gửi sang DeepSeek (`deepseek-v4-flash`).
- B8: **[Post-processing]** Sau khi LLM trả lời, nếu lệnh của User là tóm tắt (Summary), dùng Regex loại bỏ mọi dấu hỏi gặng lân la ở cuối câu để giữ sự khách quan.
- B9: Tại `index.js`, dùng Regex linh hoạt (dựa trên `getAttr`) bóc tách `<PROFILE>`, `<FACT>`, `<REACT>`, `<TOPIC>`.
- B10: Xóa các tàn dư thẻ XML, định dạng tin nhắn, và lưu tin nhắn nguyên bản vào RTDB.

### 2.2. MasterScheduler (Cron Tasks)
- **Tần suất**: Đang chạy mỗi 30 phút (`0,30 * * * *`).
- **Nhiệm vụ 1 (Bản tin)**: 8:00 sáng và 13:30 chiều (T2 - T6). Tổng hợp tin tức và gửi chủ động (push) tới các `NOTIFICATION_TARGET_IDS`.
- **Nhiệm vụ 2 (Memory Compression)**: Mỗi 4 tiếng. Quét các Active Sessions, đẩy hàng loạt tin nhắn thô sang Gemini để tóm tắt thành đoạn văn ngắn và trích xuất Audit Logs (hallucination, missed topics). Lưu bản tóm tắt và xóa tin nhắn thô khỏi RTDB.

### 2.3. Hybrid Memory Strategy
Dự án sử dụng cơ chế nhớ 3 tầng tiết kiệm chi phí:
1. **RAM Cache**: Cache thông tin Metadata (hot topic, danh sách thành viên) và Facts/Profiles trong bộ nhớ tạm của Google Cloud Function (timeout 5 phút).
2. **Realtime Database (RTDB)**: Nơi lưu tin nhắn "thô" (với Unlimited Writes) để giữ mạch hội thoại siêu ngắn hạn trước khi nén.
3. **Firestore**: Chỉ ghi log kiểm toán dài hạn (Audit Logs), Profiles cố định, cấu hình giới hạn (Quota). Ít bị gọi nhất. Các script dọn dẹp (cleanup_audit, cleanup_update) được chạy độc lập trên local để dọn rác logs khi cần.

---

## 3. Cấu Trúc Dữ Liệu (Data Schemas)

### 3.1. Firebase Realtime Database (RTDB)
```json
{
  "active_sessions": {
    "sessionId": true
  },
  "chats": {
    "sessionId": {
      "messages": {
        "msgId1": { "role": "user", "text": "...", "senderName": "Lâm" }
      },
      "metadata": {
        "hotTopic": "AI Agent",
        "last_links": ["https://vnexpress.net/..."]
      }
    }
  },
  "facts": {
    "global": {
      "index": { "factId1": { "topic": "Kinh tế", "keywords": ["CPI", "lạm phát"] } },
      "detail": { "factId1": { "content": "...", "createdAt": 1700000000 } }
    }
  }
}
```

### 3.2. Cloud Firestore
```text
users (Collection)
  └─ sessionId (Doc)
       ├─ summaries (Array)
       └─ (No longer stores raw messages, fully offloaded to RTDB)

user_profiles (Collection)
  └─ userId (Doc)
       ├─ real_name: "Lâm"
       ├─ gender: "nam"
       ├─ public_traits: "Dev, Thích công nghệ"
       ├─ private_traits: "..."
       └─ traits: ["hay hỏi"]

audit_logs (Collection)
  └─ logId (Doc)
       ├─ sessionId: "1234"
       ├─ audit_issues: [{ "user_question": "...", "issue_type": "hallucination" }]
       ├─ audit_keywords: [{ "word": "apple fold", "is_today_sensitive": false }]
       └─ expireAt: Timestamp
```

---

## 4. Bảng Biến Môi Trường (Environment Variables)

| Biến | Ý nghĩa & Nơi dùng |
| :--- | :--- |
| `PLATFORM` | Chọn nền tảng (LINE hoặc TELEGRAM) |
| `CHANNEL_ACCESS_TOKEN` | (LINE) Token gửi tin nhắn chủ động |
| `CHANNEL_SECRET` | (LINE) Secret key xác thực chữ ký Webhook |
| `TELEGRAM_BOT_TOKEN` | (Telegram) Token quản lý Bot API |
| `TELEGRAM_SECRET_TOKEN` | (Telegram) Mã xác thực chống giả mạo Webhook |
| `TELEGRAM_ADMIN_APPPROVAL_ID` | Telegram User ID của Admin (dùng để duyệt lệnh Facts) |
| `LLM_PROVIDER` | `DEEPSEEK` hoặc `GEMINI` (định hướng router llm.js) |
| `API_KEY` | API Key của Google Gemini |
| `DEEPSEEK_API_KEY` | API Key của DeepSeek |
| `DEEPSEEK_MODEL` | Chỉ định phiên bản model (hiện đang dùng `deepseek-v4-flash`) |
| `TAVILY_API_KEY` | Key của Tavily Search API (Tin tức nhanh) |
| `EXA_API_KEY` | Key của Exa Search API (Tin tức chuyên sâu) |
| `NOTIFICATION_TARGET_IDS` | Chuỗi ID các group/user nhận bản tin hằng ngày |
