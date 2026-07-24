# Triển Khai Tính Năng Đặt Lịch Hẹn (Smart Scheduler)

Tính năng đặt lịch hẹn giúp Bot thực hiện tác vụ (nhắc nhở, gửi lời chúc, báo cáo...) vào một thời điểm chính xác hoặc theo chu kỳ.
Dựa trên nguyên tắc DRY, KISS, YAGNI và Cost Minimization, giải pháp sẽ tái sử dụng `masterScheduler` (Cloud Scheduler) hiện có thay vì tạo Job mới để giữ chi phí 0đ, đồng thời dùng RTDB để giảm triệt để chi phí Read/Write so với Firestore.

## Quyết Định Thiết Kế Quan Trọng
> [!IMPORTANT]
> - **Tần suất Cronjob**: Để lịch hẹn chạy chính xác (ví dụ đúng 0:00), cần đổi `masterScheduler` từ 30 phút/lần thành **5 phút/lần** (`*/5 * * * *`). Việc này làm tăng số lần chạy (8640 lần/tháng), nhưng Cloud Scheduler cho phép 3 Job miễn phí (bất kể tần suất) và Cloud Functions cho phép 2,000,000 lần gọi/tháng, nên chi phí vẫn đảm bảo là **0đ**.

## Kế Hoạch Triển Khai Thay Đổi

### 1. Database Layer (`functions/utils/db.js`)
Thêm các hàm tương tác RTDB (node `schedules`) cực kỳ nhẹ:
- `saveSchedule(scheduleData)`: Tạo mới lịch.
- `getUserSchedules(userId)`: Lấy danh sách lịch của 1 user.
- `getAllSchedules()`: Lấy toàn bộ lịch (dành cho Admin).
- `deleteSchedule(id)`: Xóa lịch theo ID.
- `getDueSchedules(now)`: Lấy lịch tới hạn (`nextRun <= now`) - dùng `orderByChild` kết hợp `endAt`.

### 2. LLM Instruction (`functions/utils/deepseek.js`)
Cập nhật System Prompt một cách ngắn gọn nhất (Token Optimize) để dạy LLM cách dùng thẻ `<SCHEDULE>`:
```javascript
- Lịch hẹn: <SCHEDULE action="ADD" type="ONCE|DAILY|WEEKLY" time="YYYY-MM-DD HH:mm|HH:mm|D HH:mm" prompt="..." /> | Xóa: <SCHEDULE action="DEL" id="..." /> | Xem: <SCHEDULE action="LIST" /> (hoặc ADMIN_LIST)
```

### 3. Controller Layer (`functions/index.js`)
#### A. Xử lý logic đặt lịch (Webhook)
Bổ sung luồng regex bắt thẻ `<SCHEDULE>` trong text do LLM trả về:
- **ADD**: Hàm tính toán mốc thời gian VN (múi giờ `Asia/Ho_Chi_Minh`) chuyển thành timestamp (ms). Sinh mã ID ngắn (4-5 ký tự) lưu vào DB. Thay thế thẻ bằng thông báo: *"Đã đặt lịch thành công với mã [ID]"*.
- **LIST / ADMIN_LIST**: Fetch data từ RTDB, format thành danh sách đánh số kèm mã ID.
- **DEL**: Xóa lịch khỏi RTDB dựa trên ID.

#### B. Trình kích hoạt (masterScheduler)
- Sửa schedule thành `*/5 * * * *`.
- Điều chỉnh các điều kiện cũ (Tin sáng/chiều, Dọn rác) thành `minute < 5` hoặc `minute >= 30 && minute < 35` để tránh chạy lặp lại nhiều lần trong cùng khung giờ do cron 5 phút.
- Thêm block **Xử lý lịch tới hạn**:
  - Truy vấn `getDueSchedules`.
  - Với mỗi nhiệm vụ: Đẩy `prompt` vào LLM kèm context báo đây là lệnh đến giờ thực thi.
  - Gửi kết quả về `chatId`.
  - Nếu `type == ONCE` thì xóa; nếu `DAILY/WEEKLY` thì tự động cộng thêm thời gian và update `nextRun`.

## Verification Plan
### Kiểm Tra Thủ Công
1. Dùng tài khoản thường chat: "Nhắc tôi uống nước sau 5 phút nữa" -> Kiểm tra Bot phản hồi mã đặt lịch.
2. Kiểm tra xem đúng 5 phút sau Bot có nhắn tin không.
3. Chat: "Xem lịch của tôi" -> Kiểm tra hiển thị.
4. Chat: "Xóa lịch mã XYZ" -> Kiểm tra lịch biến mất.
5. Dùng tài khoản Admin chat: "Liệt kê toàn bộ lịch của mọi người" -> Đảm bảo Admin lấy được full danh sách.
