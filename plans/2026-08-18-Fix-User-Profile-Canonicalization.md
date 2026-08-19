# Kế hoạch chuẩn hóa Hồ sơ người dùng tách biệt theo Nền tảng (Platform-Isolated User Profiles)

## 1. Nguyên tắc cốt lõi (Core Principles)
- **Tách biệt hoàn toàn theo Nền tảng (Platform Isolation):** Do tên người dùng có thể trùng nhau giữa các môi trường, LINE và Telegram sẽ quản lý hồ sơ độc lập trên Firestore của từng dự án.
- **Single Source of Truth:** Mỗi người dùng trên một nền tảng chỉ có **DUY NHẤT 1 HỒ SƠ**, lưu trực tiếp dưới Document ID là **Platform User ID** thực tế:
  - **LINE Database:** Bắt buộc dùng LINE User ID (`U[a-f0-9]{32}`).
  - **Telegram Database:** Bắt buộc dùng Telegram Numeric User ID (`^\d+$`).
- **Chặn đứng document nickname rác:** Không cho phép tạo document mới bằng tên riêng/nickname (`"Acatms"`, `"Châu"`, `"lam"`...).

---

## 2. Giải pháp Code chi tiết

### 1. Hàm kiểm tra Canonical User ID theo Nền tảng (`isCanonicalPlatformId`)
```javascript
const isCanonicalPlatformId = (id, platform = "LINE") => {
  if (!id || typeof id !== "string") return false;
  if (platform === "LINE") {
    return /^U[a-f0-9]{32}$/i.test(id) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  } else {
    return /^\d+$/.test(id);
  }
};
```

### 2. Phân giải danh tính thông minh trong `processAndExtractProfile` ([index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js))
- Khi LLM xuất `<PROFILE userId="..." ... />`:
  - Nếu `userId` đã là Canonical ID của nền tảng hiện tại $\to$ Sử dụng trực tiếp.
  - Nếu là tên/nickname $\to$ Tra cứu trong `participants` của session và `globalParticipants` của nền tảng hiện tại (`line` hoặc `tg`).
  - Nếu `userId` nói về chính người gửi (hoặc không truyền `userId`) $\to$ Gán vào `senderId`.
  - Nếu không tìm được ID thực tế $\to$ **TUYỆT ĐỐI KHÔNG tạo document rác bằng tên riêng**, ghi log và bỏ qua.

### 3. Lớp bảo vệ trong `saveUserProfile` ([db.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/db.js))
- Bổ sung Guard kiểm tra ID hợp lệ trước khi ghi vào Firestore `user_profiles`.

---

## 3. Kế hoạch Gộp & Dọn dẹp Database (Platform Migration)

### Trên Telegram Firestore (`tele-ai-chatbot`):
- Gộp vào **`1098066961` (Châu):** `Acatms`, `ChauNguyen`, `Châu`, `chau`.
- Gộp vào **`2140581850` (Lâm):** `1`, `Lâm`, `lam`, `Eddy`, `e6c4c2e1-423e-4819-8f63-e5e1e5b0b1e1`.
- Gộp vào **`730806080` (Du):** `badpaybad`.
- Xóa các document rác: `Acatms`, `ChauNguyen`, `Châu`, `chau`, `1`, `Lâm`, `lam`, `Eddy`, `badpaybad`, `eddy`, `e6c4c2e1-...`.

### Trên LINE Firestore (`line-ai-chatbot-eab18`):
- Gộp vào **`U6cc1a9cfda8d2f79d0aae1778becfb65` (Lâm):** `1`, `Lâm`, `lâm`, `lam`, `lamho`, `Eddy`, `Eddy (Lam Ho)`, `Eddy(LamHo)`, `eddy`, `eddy-lamho`.
- Gộp vào **`U016d7cf9cc1f87925e082dccfda2dc98` (Duy):** `duy-mac-van`.
- Gộp vào **`1098066961` / Nickname Telegram cũ nếu có:** Gộp `acatms`, `chau-nguyen`, `chau_nguyen` vào `1098066961`.
- Gộp vào **`730806080`:** Gộp `du`.
- Xóa các document nickname rác không phải Canonical ID.
