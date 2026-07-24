# 📖 Tài Liệu Đặc Tả Kỹ Thuật (Technical Specs)
> **Cập nhật:** Lần cuối vào ngày 12/07/2026

Tài liệu này mô tả chi tiết logic, cấu trúc dữ liệu và các luồng xử lý bên dưới của hệ thống Chatbot.

---

## 1. Tổng Quan Module

| File / Module | Chức năng cốt lõi |
| :--- | :--- |
| `index.js` | Entry point. Chứa `webhook` (hứng message) và `masterScheduler` (hẹn giờ). Fallback reaction emoji. |
| `utils/db.js` | Tương tác Firebase (RTDB lưu tin nhắn tạm, Firestore lưu Profile và Session). |
| `utils/llm.js` | Router chọn Model (DeepSeek hoặc Gemini) dựa theo Env variable. |
| `utils/deepseek.js` | Gọi API DeepSeek. Định nghĩa System Prompt chính, xử lý Rule và Memory. |
| `utils/gemini.js` | Xử lý đa phương tiện (Ảnh, PDF), tóm tắt tin nhắn lịch sử và Audit Log. |
| `utils/search.js` | Thuật toán Regex phân loại câu hỏi, quyết định Search và chọn Tavily/Exa. |
| `utils/tavily.js` / `exa.js` | Gọi API Search Engine. Lọc và định dạng kết quả Search. |
| `utils/line.js` | Tiện ích gửi tin nhắn, lấy avatar, get user profile cho LINE. |
| `utils/telegram.js` | Tiện ích gửi tin nhắn, reaction, bàn phím inline. Băm nhỏ tin nhắn (Chunking). |
| `utils/news.js` | Tổng hợp tin tức hàng ngày (Cronjob). |

---

## 2. Luồng Xử Lý Chi Tiết (Flows)

### 2.1. Chat Text Thường (Telegram & LINE)
1. User gửi tin nhắn (Text).
2. Webhook (`index.js`) nhận Request, xác thực chữ ký (với LINE).
3. Đọc Whitelist. Nếu không có quyền -> Chặn.
4. Kiểm tra RAM Cache (`userProfileCache`) để lấy hồ sơ người gửi siêu tốc.
5. `buildGroupProfileContext`: Bơm ngữ cảnh tầng 1 (Tên, Giới tính) mặc định. Nếu phát hiện từ khoá (nhớ, thích, tên...) bơm tầng 2 (Traits).
6. Chạy `search.js` để xem câu có Entity thực tế không. Nếu có -> Gọi `tavily` hoặc `exa`.
7. Gộp Text + Profile Context + Search Context -> Gửi cho `deepseek.js`.
8. LLM trả về Text. Chạy hàm `processAndExtractProfile` để bóc tách XML tags (`<PROFILE.../>`, `<REACT.../>`).
9. Khớp tag Reaction với mảng 73 Emoji hợp lệ của Telegram, nếu lỗi tự động Fallback sang `❤`.
10. Chạy hàm băm nhỏ tin nhắn (Chunking) trong `telegram.js` với `MAX_LEN = 2000`, convert thẻ `**` sang `<b>` an toàn.
11. Gửi chuỗi tin nhắn tuần tự (`telegram.reply` hoặc `line.reply`).
12. Lưu `[UserMsg, BotMsg]` vào RTDB ở Background.
13. Bắn API Reaction (Chỉ Telegram).

### 2.2. Web Context Resolution (Quyết định Search)
Thuật toán phân tích câu hỏi trong `search.js`:
- Bắt các từ khoá ngày tháng ("hôm nay", "tháng 7", "năm 2026") -> Yêu cầu Search thời gian thực.
- Kiểm tra `has_entity`: Tìm kiếm Tên riêng viết hoa, hoặc các thương hiệu (được cấu hình regex như vinamilk, fpt, v.v.).
- Nếu câu có Entity và mang tính kiến thức/hỏi đáp -> Trả về `true` (Cần Search).
- Khi đó, dùng Tavily làm mặc định, nếu câu hỏi cần review/phân tích sâu thì có thể nhảy sang Exa (nếu cấu hình).

### 2.3. DeepSeek Chat Function (System Prompt)
System Prompt được build động tại thời điểm chạy:
- **Role & Style**: Xưng "em", gọi "anh/chị". Dùng nhiều Emoji.
- **Rule 0**: Nếu mơ hồ -> Yêu cầu hỏi lại bằng tag `<Task mode="ASK" tags="..."/>`.
- **Rule 1-2**: Ưu tiên 100% dữ kiện Search. Cấm bịa data.
- **Rule 3**: Thao tác bộ nhớ. Dùng `<PROFILE action="ADD|REMOVE|UPDATE">` để quản lý `traits` của User.
- **Rule 6**: Reaction siêu ngắn gọn `Tuỳ chọn chèn <REACT emoji="[emoji]" /> ở cuối để phản ứng câu User.` giúp tiết kiệm Token và đa dạng cảm xúc.

### 2.4. Hybrid Memory (3 Tầng Bộ Nhớ)
- **Tầng 1 (RAM)**: `userProfileCache` (Map) chạy trên RAM của Node.js instance. Cực nhanh, 0đ chi phí đọc.
- **Tầng 2 (RTDB)**: Lịch sử hội thoại 50 tin nhắn gần nhất. Load nhanh, chi phí băng thông cực rẻ.
- **Tầng 3 (Firestore)**: Thông tin định danh dài hạn (`userProfiles`, `chats`), Traits, cấu hình nhóm.

---

## 3. Cấu Trúc Dữ Liệu (Database Schema)

### 3.1. Firebase RTDB (Realtime Database)
```text
/
├── chats/
│   └── {chatId}/
│       └── messages/
│           ├── {pushId1}: { role: "user", text: "...", senderName: "A", createdAt: "..." }
│           └── {pushId2}: { role: "model", text: "...", createdAt: "..." }
```

### 3.2. Firestore (NoSQL)
```text
/userProfiles/{userId}
├── real_name: string
├── gender: "nam" | "nu"
├── traits: array<string> (VD: ["Thích code", "Ghét hành tây"])

/chats/{chatId}
├── hotTopic: string
├── metadata: object
```

---

## 4. Bảng Biến Môi Trường (Environment Variables)

| Tên biến | Chức năng | Phân loại |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | Quyết định Model chính (`DEEPSEEK` hoặc `GEMINI`). | Hệ thống |
| `DEEPSEEK_API_KEY` | Key gọi LLM DeepSeek. | API Key |
| `GEMINI_API_KEY` | Key gọi LLM Gemini (Google). | API Key |
| `TAVILY_API_KEY` | Key gọi Search Engine Tavily. | API Key |
| `TELEGRAM_BOT_TOKEN` | Token để nhận/gửi tin nhắn qua Telegram Bot. | Credential |
| `CHANNEL_ACCESS_TOKEN` | Token nhắn tin LINE. | Credential |
| `CHANNEL_SECRET` | Secret xác thực Webhook LINE. | Credential |
| `TZ` | Timezone mặc định (`Asia/Ho_Chi_Minh`). | Hệ thống |
