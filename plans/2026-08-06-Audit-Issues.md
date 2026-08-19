# Báo cáo Audit & Kế hoạch sửa lỗi Hallucination (Cập nhật)

Đã thực hiện script fetch dữ liệu từ Firestore (`audit_logs`), điều tra log hoạt động của Telegram Group, và phân tích các yêu cầu bổ sung. Dưới đây là phân tích nguyên nhân gốc rễ và giải pháp đã triển khai.

## 1. Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

Qua điều tra các sự cố "Râu ông nọ cắm cằm bà kia" (lẫn lộn Châu & Lâm) và sự cố "Vòng lặp link sai", các nguyên nhân cốt lõi được xác định:

1. **Nguyên nhân 1 (Lẫn lộn Context trong Group Chat):**
   - **Vấn đề:** Khi hoạt động trong Group, Bot lấy `mbti_profile` dựa trên `sessionId` (Group ID) thay vì User ID. Đồng thời, System Prompt có lệnh *"Đồng cảm với [HỒ SƠ TÂM LÝ USER]"* khiến LLM cố gắng áp dụng 1 hồ sơ duy nhất cho tất cả người nói trong group. Kết quả là tính cách hoặc thông tin của Châu bị gán cho Lâm, dẫn đến việc bot bình giải thần số học nhầm người hoặc nhận diện sai ảnh bạn gái.
   - **Giải pháp:** Bổ sung rule nghiêm ngặt: `CẤM nhầm người. TUYỆT ĐỐI KHÔNG lấy dữ liệu/hình ảnh/hồ sơ của User này gán cho User khác.` và `TUYỆT ĐỐI KHÔNG tự suy diễn quan điểm, sở thích của User nếu họ không trực tiếp phát biểu.`

2. **Nguyên nhân 2 (Vòng lặp URL fake khi bị truy vấn):**
   - **Vấn đề:** Khi User hỏi "tại sao đưa link sai", Bot bị rơi vào bẫy của System Prompt cũ: *"BẮT BUỘC trích [ Nguồn: URL ]"*. Áp lực phải tuân thủ rule này khiến LLM tiếp tục bịa một URL khác (VnExpress/Vietnamnet) thay vì nhận lỗi (Self-correction).
   - **Giải pháp:** Sửa rule nguồn thành: `CẤM BỊA URL. Trích đúng [ Nguồn: URL ]. Nếu bị User bóc phốt link sai, KHÔNG ĐƯỢC cãi cùn hay gửi lại link cũ, PHẢI xin lỗi và giải thích nguyên nhân.`

## 2. Các Hạng mục Đã Khắc phục (Đã Fix)

| STT | Vấn đề | Giải pháp đã triển khai | File ảnh hưởng |
| :--- | :--- | :--- | :--- |
| 1 | Hallucination Context (Nhầm người) | Cập nhật `buildSystemPrompt` để ngăn chặn gán ghép profile và chống tự suy diễn. | `functions/utils/deepseek.js` |
| 2 | Hallucination Fake URL (Vòng lặp) | Bổ sung rule bắt buộc phải nhận lỗi/giải thích khi link bị bóc phốt, cấm cãi cùn. | `functions/utils/deepseek.js` |
| 3 | Lỗi thông báo Bản tin | Bỏ thông báo *"Anh chị ơi, em đang bị lỗi kết nối..."*, đổi thành `return null`. | `functions/utils/news.js` |
| 4 | Spam Bản tin rỗng ra Group | Thêm điều kiện `if (!newsDigest) return;` trong hàm `sendNotifications`. | `functions/index.js` |
| 5 | Gửi thừa Bản tin Telegram | Xoá User ID `2140581850` khỏi `NOTIFICATION_TARGET_IDS`, chỉ giữ lại Group ID. | `functions/.env.tele-ai-chatbot` |
| 6 | Trôi token do Focus Mode quá nhạy | Thêm Regex check: Chỉ reply trong Focus Mode nếu câu nói là câu hỏi (có `?`) hoặc chứa từ khoá (tại sao, làm sao, kể, tính...). | `functions/index.js` |
| 7 | Data Audit thừa | Chạy script xoá trường `audit_issues` cũ trong Firestore để tối ưu dung lượng DB. | Database (Firestore) |

Tất cả các thay đổi trên đều tuân thủ nguyên tắc: Tối ưu Token (System Prompt súc tích), Giảm thiểu Chi phí (Dùng Regex thay vì LLM cho Focus Mode), và Chỉ sửa Code (Chưa Deploy).
