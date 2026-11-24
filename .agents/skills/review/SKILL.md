---
name: review
description: Đọc lịch sử chấm điểm của Independent AI Reviewer từ Firestore (bot_reviews_history), phân tích điểm yếu và đề xuất phương án nâng cấp bot.
---

Khi người dùng yêu cầu đọc lại kết quả chấm điểm của Reviewer (ví dụ: `/review`, "đọc log chấm điểm", "xem đánh giá reviewer", "tham khảo điểm chấm để nâng cấp bot"), bạn (AI) PHẢI thực hiện quy trình sau:

1. **Đọc dữ liệu chấm điểm (`Fetch Review History`):**
   - Chạy script có sẵn `node functions/scratch/read_bot_reviews.js` để đọc document `system_configs/bot_reviews_history` trên Firestore (`line-ai-chatbot-eab18`).
   - Xem xét các kỳ đánh giá gần nhất: `totalScore`, điểm 4 trụ cột (`intelligence`, `subtlety`, `accuracy`, `evolution`), `pillars_analysis`, `delta_explanation`, `weaknesses`, và `next_upgrades`.

2. **Đối chiếu & Phân tích (`Analyze`):**
   - Nếu cần kiểm tra sâu một lỗi cụ thể được nhắc trong review, đối chiếu thêm với `logs/qa_traces` trên RTDB và mã nguồn hiện tại trong `functions/`.
   - Phân loại rõ đâu là vấn đề về logic code (ưu tiên xử lý bằng JS/Regex $0 chi phí), đâu là vấn đề về Ground Truth data, và đâu là Custom Skill cần tinh chỉnh.

3. **Đề xuất Giải pháp Thông minh (`Propose Upgrades`):**
   - Lập kế hoạch ngắn gọn, rõ ràng theo đúng nguyên tắc của `AGENTS.md` (Tối thiểu chi phí, General Prompt, Không vá víu cục bộ, Đồng bộ đa nền tảng LINE ↔ Telegram).
   - Trình bày cho Sếp duyệt trước khi sửa code và deploy.
