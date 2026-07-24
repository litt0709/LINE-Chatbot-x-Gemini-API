# Project Rules & Guidelines

Dưới đây là các nguyên tắc cốt lõi mà AI (Antigravity IDE) bắt buộc phải tuân thủ trong quá trình làm việc với dự án này:

- **Tuân thủ nguyên tắc phát triển phần mềm cơ bản:** Luôn ưu tiên các nguyên lý DRY (Don't Repeat Yourself), KISS (Keep It Simple, Stupid) và YAGNI (You Aren't Gonna Need It) để giữ code sạch, tối giản và không dư thừa.
- **Nắm bắt tổng quan hệ thống:** Luôn đọc và tham khảo các file markdown trong thư mục `docs/` trước khi thực hiện viết code hoặc sửa đổi để hiểu rõ kiến trúc và luồng xử lý.
- **Điều tra Issue toàn diện:** Khi điều tra lỗi (issue), bắt buộc phải tìm hiểu thông tin từ cả `logs` và `firestore logs` để có cái nhìn đầy đủ nhất về vấn đề.
- **Tối ưu hóa Prompt (General Prompt & Token Optimize):** Khi viết hoặc chỉnh sửa prompt, phải áp dụng các kỹ thuật tối ưu hóa token, sử dụng cấu trúc prompt tổng quát (General Prompt), ngắn gọn và súc tích nhất để tiết kiệm dung lượng Context Window.
- **Tối thiểu hóa chi phí (Cost Minimization):** Mọi giải pháp kiến trúc, thuật toán hoặc phương án code được đề xuất bắt buộc phải là phương án tối ưu nhất về mặt chi phí vận hành (giảm thiểu số lượng API calls, tiết kiệm database read/write, và tiết kiệm token LLM).
