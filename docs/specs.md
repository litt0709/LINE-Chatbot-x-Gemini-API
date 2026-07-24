# 📖 Tài Liệu Đặc Tả Kỹ Thuật (Technical Specs)
> **Cập nhật:** Lần cuối vào ngày 24/07/2026

Tài liệu này mô tả chi tiết logic, cấu trúc dữ liệu và các luồng xử lý bên dưới của hệ thống Chatbot.

---

## 1. Tổng Quan Module

| File / Module | Chức năng cốt lõi |
| :--- | :--- |
| `index.js` | Entry point. Chứa `webhook` (hứng message) và cấu hình Fast Path. Lọc chống lộ Prompt qua `leak_blacklist.json`. Tích hợp xử lý Mention TextV2 của LINE. Duyệt Global Fact. |
| `utils/db.js` | Tương tác Firebase. Tầng 1: Cache RAM siêu tốc. Tầng 2: RTDB lưu tin nhắn thô, Metadata, Facts Detail. Tầng 3: Firestore lưu Profile, Audit Logs, Exa Quota. |
| `utils/llm.js` | Router chọn Model (DeepSeek hoặc Gemini) dựa theo Env variable. |
| `utils/deepseek.js` | Gọi API DeepSeek. Định nghĩa System Prompt chính, xử lý Rule và Memory. Dịch nút bấm thành Smart Search Query. Nhận diện Fast Path xin link. |
| `utils/gemini.js` | Xử lý đa phương tiện (Ảnh, PDF). Tóm tắt tin nhắn lịch sử và bóc tách Audit Log (từ khóa search, missed topics, missed link, stopwords). |
| `utils/search.js` | Thuật toán Regex phân loại câu hỏi, Quyết định Search, Scrape trực tiếp URL và định tuyến tới Tavily/Exa. |
| `utils/tavily.js` / `exa.js` | Gọi API Search Engine. Tavily phân loại nguồn VN/Intl qua `trusted_sources.json`. Exa bị quản lý giới hạn hạn ngạch cứng 950 request/tháng. |
| `utils/line.js` | Gửi tin nhắn, lấy avatar, get user profile, hỗ trợ đặc tả TextV2. |
| `utils/telegram.js` | Gửi tin nhắn, reaction, bàn phím inline. Thuật toán băm nhỏ tin nhắn (Chunking MAX_LEN = 2000). |
| `utils/news.js` | Tổng hợp tin tức hàng ngày (Sáng: Truyền cảm hứng / Chiều: Tin thời sự). |

---

## 2. Luồng Xử Lý Chi Tiết (Flows)

### 2.1. Chat Text Thường (Telegram & LINE)
1. User gửi tin nhắn (Text).
2. Webhook (`index.js`) nhận Request, xác thực chữ ký. Lọc Blacklist chống Prompt Leakage.
3. Nếu là câu hỏi thời gian thuần túy (Mấy giờ rồi, nay ngày mấy) -> Fast Path trả lời ngay không gọi LLM.
4. Kiểm tra RAM Cache (`userProfileCache`) để lấy hồ sơ người gửi siêu tốc.
5. Bơm ngữ cảnh `groupContext` (Tên, Giới tính, Traits) và `factsContext` từ RTDB Cache.
6. Chạy `search.js` để xem câu có Entity thực tế không. Dùng cơ chế "Ghim Chủ Đề" để bù đắp các câu lệnh ngắn. Nếu cần -> Gọi API Search hoặc Scrape URL.
7. Gộp Text + Profile Context + Search Context + Facts Context -> Gửi cho `deepseek.js`.
8. LLM trả về Text. Chạy hàm `processAndExtractProfile` bóc tách XML tags (`<PROFILE>`, `<FACT>`, `<REACT>`, `<Task>`).
9. Xử lý Tags:
   - `<PROFILE>`: Cập nhật trait của user.
   - `<FACT>`: Lưu pending RTDB và gửi Telegram admin duyệt.
   - `<Task>`: Dịch ra QuickReply cho LINE / Bàn phím Inline cho Telegram.
   - `<REACT>`: Đẩy reaction emoji (Telegram).
10. Format nội dung: Chuyển mentions `@name` sang `tg://user?id=` (Telegram) hoặc `{user_N}` (LINE textV2). Chạy hàm băm nhỏ (Chunking) cho Telegram.
11. Gửi chuỗi tin nhắn tuần tự.
12. Lưu lịch sử chat vào RTDB ở Background.

### 2.2. Web Context Resolution (Quyết định Search)
Thuật toán phân tích câu hỏi trong `search.js`:
- Lọc stopwords bằng `stopwords.json`.
- Bắt các từ khoá ngày tháng ("hôm nay", "tháng 7", "năm 2026") -> Yêu cầu Search thời gian thực.
- Kiểm tra `has_entity`: Tìm kiếm Tên riêng viết hoa, hoặc các thương hiệu.
- Quyết định Search và tự động dịch Category sang query chuẩn. Nếu category `DEV/SOCIAL` ưu tiên Exa. Nếu `NEWS` ưu tiên Tavily.

### 2.3. Tự Học Fact Mới (Global/User Facts)
1. LLM sinh thẻ `<FACT action="ADD" topic="..." keywords="..." content="..." />` khi nghe được kiến thức mới.
2. Hệ thống lưu tạm thời vào `facts/pending/{factId}` trên RTDB.
3. Gửi tin nhắn thông báo dạng Inline Keyboard qua Telegram cho Admin.
4. Admin ấn "✅ Duyệt Global": Fact được lưu vào `facts/global` và phân quyền sử dụng cho toàn hệ thống.
5. Ở các câu chat sau, hệ thống regex từ khóa từ Fact Index để bơm vào `factsContext`.

### 2.4. Audit Log & Memory Compression
- Chạy thông qua Gemini (`gemini.js`): Tổng hợp 50 tin nhắn cuối.
- Yêu cầu xuất JSON chuẩn.
- Gom các dữ liệu: `audit_keywords`, `audit_issues` (phát hiện hallucination), `missed_link_requests`, `missed_topics`, `suggested_stopwords`.
- Lưu JSON này vào bảng `audit_logs` trên Firestore với TTL (thời gian sống) 30 ngày. 

---

## 3. Cấu Trúc Dữ Liệu (Database Schema)

### 3.1. Firebase RTDB (Realtime Database)
```text
/
├── active_sessions/       # Đánh dấu phiên chat đang active
├── chats/
│   └── {chatId}/
│       ├── messages/      # Chứa {pushId}: { role, text, senderName, ... }
│       └── metadata/      # Lịch sử liên kết web, danh sách participants
├── facts/
│   ├── pending/           # Các facts chờ Admin duyệt
│   ├── global/            # Facts kiến thức chung của toàn hệ thống (index & detail)
│   └── users/{userId}/    # Facts riêng của người dùng/nhóm (index & detail)
└── metadata/
    └── {platform}_participants  # Danh sách mapping Name -> ID
```

### 3.2. Firestore (NoSQL)
```text
/userProfiles/{userId}
├── real_name: string
├── gender: "nam" | "nu"
├── public_traits: string
├── private_traits: string
├── traits: array<string>

/users/{chatId}
├── summaries: array<string> (Tóm tắt dài hạn)

/audit_logs/{logId}
├── timestamp: string
├── audit_keywords: array
├── audit_issues: array
├── missed_link_requests: array
├── missed_topics: array
├── suggested_stopwords: array
├── expireAt: timestamp

/metadata/exa_usage
├── month: string (VD: "2026-07")
├── count: number (Quota counter)
```

---

## 4. Bảng Biến Môi Trường (Environment Variables)

| Tên biến | Chức năng | Phân loại |
| :--- | :--- | :--- |
| `LLM_PROVIDER` | Quyết định Model chính (`DEEPSEEK` hoặc `GEMINI`). | Hệ thống |
| `DEEPSEEK_API_KEY` | Key gọi LLM DeepSeek. | API Key |
| `GEMINI_API_KEY` | Key gọi LLM Gemini (Google). | API Key |
| `TAVILY_API_KEY` | Key gọi Search Engine Tavily. | API Key |
| `EXA_API_KEY` | Key gọi Search Engine Exa. | API Key |
| `TELEGRAM_BOT_TOKEN` | Token để nhận/gửi tin nhắn qua Telegram Bot. | Credential |
| `TELEGRAM_ADMIN_APPPROVAL_ID` | Telegram Chat ID của quản trị viên duyệt Fact. | Cấu hình |
| `CHANNEL_ACCESS_TOKEN` | Token nhắn tin LINE. | Credential |
| `CHANNEL_SECRET` | Secret xác thực Webhook LINE. | Credential |
| `TZ` | Timezone mặc định (`Asia/Ho_Chi_Minh`). | Hệ thống |
