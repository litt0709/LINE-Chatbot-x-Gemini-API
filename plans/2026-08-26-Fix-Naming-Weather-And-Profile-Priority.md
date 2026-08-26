# Kế hoạch điều tra Root Cause & Sửa lỗi: Nhầm tên người dùng, Tra cứu thời tiết & Tối ưu Profile nhân vật

## 1. Root Cause Summary
- **Issue 1 (Nhầm tên Lâm thành Vĩnh)**: Trong group chat có người tên Vĩnh, bot sinh tag `<PROFILE real_name="Vĩnh" />` không có `userId`. Hàm `processAndExtractProfile` fallback gán cho `senderId` (`U6cc1a9cf...` của Lâm). Khi Lâm sang group khác, bot đọc `userProfile.real_name` ("Vĩnh") và ghi đè `senderName` khiến bot gọi Lâm là Vĩnh.
- **Issue 2 (Hỏi thời tiết bảo không tìm được nhưng vẫn nói)**: `tavily.js` bị ép `include_domains` chỉ có 19 tờ báo chung và có cờ `time_range: "day"`, không chứa trang thời tiết chuyên dụng (`nchmf.gov.vn`, `dubaothoitiet.edu.vn`, `accuweather.com`...). Khi query chỉ là "thời tiết" không có vị trí, kết quả trả về rỗng hoặc trích đoạn rời rạc. LLM tuân thủ Rule 2.2 nên bảo "không tìm thấy dữ liệu..." nhưng vẫn cố tổng hợp từ trích đoạn.
- **Issue 3 (Profile TrinhNX thành Trịnh, ưu tiên name trong profile)**: Profile của user TrinhNX (`Uf2513b0...`) chưa có `real_name: "Trịnh"`. Cần bổ sung profile và cập nhật System Prompt Rule 0 để ưu tiên gọi tên thật tự nhiên thay vì username/nickname kỹ thuật (như TrinhNX, litt0709, eddy, badpaybad).

## 2. Solution Steps
1. Sửa dữ liệu Firestore & RTDB cho `user_profiles` (Lâm, Trịnh) và `metadata/line_participants`.
2. Bổ sung Guard trong `processAndExtractProfile` ngăn đổi `real_name` của sender trong group chat nếu không có từ khóa khẳng định danh tính rõ ràng.
3. Cải tiến tìm kiếm thời tiết trong `tavily.js` & `search.js`: Bổ sung nguồn thời tiết chuyên dụng / bỏ hạn chế domain báo chí với thời tiết, bỏ `time_range: "day"`, và tự động thêm vị trí mặc định (Hà Nội) khi không có địa danh.
4. Cập nhật System Prompt Rule 0 trong `deepseek.js` để ưu tiên gọi tên thật trong hồ sơ thay vì nickname kỹ thuật.
5. Cập nhật `docs/features.md`.
