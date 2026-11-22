# Kế hoạch Tạm Thời Vô Hiệu Hóa Tính Năng Bản Tin Hàng Ngày (Daily News Digest)

## 1. Mục tiêu
- Tạm thời tắt tính năng gửi bản tin tự động (Bản tin Sáng 8:00 và Bản tin Chiều 13:30 từ Thứ 2 đến Thứ 6).
- Giữ mã nguồn rõ ràng, dễ dàng kích hoạt lại bất kỳ lúc nào thông qua cờ điều khiển `ENABLE_NEWS`.
- Đảm bảo MasterScheduler không gọi web search hay tốn tài nguyên DeepSeek API cho việc sinh bản tin khi đang bị vô hiệu hóa.
- Cập nhật tài liệu kỹ thuật và tính năng tương ứng.

## 2. Phân tích chi tiết thay đổi
1. **`functions/index.js`**:
   - Thêm cờ hằng số `ENABLE_NEWS = false` trước `sendNotifications`.
   - Trong `sendNotifications`: Kiểm tra `if (!ENABLE_NEWS) return;` kèm log thông báo tính năng đang tạm tắt.
   - Trong `masterScheduler`: Thêm điều kiện `ENABLE_NEWS` vào cả 2 nhánh kích hoạt Bản tin Sáng (8:00) và Bản tin Chiều (13:30) để tránh thực thi dư thừa và không ghi state rác vào RTDB.
2. **`docs/features.md`**:
   - Cập nhật mục 3 "Bản tin hàng ngày (Daily News Digest)" ghi chú trạng thái hiện tại: Đang tạm thời vô hiệu hóa (Disabled) qua biến `ENABLE_NEWS = false`.

## 3. Quy tắc tuân thủ
- Tuân thủ KISS, giữ nguyên logic gốc để dễ dàng bật lại.
- Chỉ sửa code và tài liệu, tuyệt đối không tự ý deploy.
