# Project Rules & Guidelines

Dưới đây là các nguyên tắc cốt lõi mà AI (Antigravity IDE) bắt buộc phải tuân thủ trong quá trình làm việc với dự án này:

- **Tuân thủ nguyên tắc phát triển phần mềm cơ bản:** Luôn ưu tiên các nguyên lý DRY (Don't Repeat Yourself), KISS (Keep It Simple, Stupid) và YAGNI (You Aren't Gonna Need It) để giữ code sạch, tối giản và không dư thừa.
- **Nắm bắt tổng quan hệ thống:** Luôn đọc và tham khảo các file markdown trong thư mục `docs/` trước khi thực hiện viết code hoặc sửa đổi để hiểu rõ kiến trúc và luồng xử lý.
- **Điều tra Issue toàn diện:** Khi điều tra lỗi (issue), bắt buộc phải tìm hiểu thông tin từ cả `logs` và `firestore logs` để có cái nhìn đầy đủ nhất về vấn đề.
- **Tối ưu hóa Prompt (General Prompt & Anti-Ad-hoc Patching):**
  - Khi viết hoặc chỉnh sửa prompt, phải áp dụng các kỹ thuật tối ưu hóa token, sử dụng cấu trúc prompt tổng quát (General Prompt), ngắn gọn và súc tích nhất để tiết kiệm dung lượng Context Window.
  - **TUYỆT ĐỐI KHÔNG vá víu cục bộ (Anti-Ad-hoc Patching):** Nghiêm cấm thêm các câu lệnh prompt mang tính chất trị một trường hợp cụ thể đơn lẻ (ví dụ: cấm chúc một câu cụ thể, cấm nói một từ cụ thể, hoặc viết rule vụn vặt chỉ để đối phó với 1 lỗi vừa xảy ra).
  - Khi bot bị hallucination hoặc phản hồi sai do thiếu ngữ cảnh: BẮT BUỘC giải quyết bằng cách **cung cấp dữ liệu đầu vào đầy đủ, chuẩn xác (Ground Truth data feeding)** hoặc **xử lý bằng logic code/post-processing**.
  - System Prompt chỉ dùng để định hình Persona và các nguyên tắc suy luận cốt lõi mang tính khái quát cao.
- **Tối thiểu hóa chi phí (Cost Minimization):** Mọi giải pháp kiến trúc, thuật toán hoặc phương án code được đề xuất bắt buộc phải là phương án tối ưu nhất về mặt chi phí vận hành (giảm thiểu số lượng API calls, tiết kiệm database read/write, và tiết kiệm token LLM).
- **Phòng tránh lỗi chữ hoa - chữ thường (Case Sensitivity):** Khi xử lý chuỗi, so sánh điều kiện, lấy dữ liệu từ cache/database hoặc sinh mã logic, AI luôn phải chú ý và đảm bảo xử lý triệt để các rủi ro liên quan đến case sensitivity (ví dụ: dùng `.toLowerCase()`, `.toUpperCase()`, hoặc biểu thức chính quy với flag `i`) để tránh lỗi ngớ ngẩn (như so sánh giá trị trả về của AI). Đồng thời, bảo toàn định dạng chữ hoa/chữ thường (original casing) đối với dữ liệu hiển thị (tên người dùng) nhằm giúp AI hiểu chuẩn xác.
- **Cập nhật tài liệu tính năng (Feature Documentation):** Bất cứ khi nào bổ sung hoặc sửa đổi một tính năng mới cho Bot, AI bắt buộc phải cập nhật nội dung vào file `docs/features.md` để đồng bộ tài liệu dự án một cách rõ ràng.
- **Hạn chế sửa System Prompt:** Khi sửa tính năng hoặc fix các issue cũ, hạn chế tối đa việc thay đổi System Prompt. Hãy ưu tiên xử lý và giải quyết vấn đề bằng logic code.
- **Lập kế hoạch trước khi hành động:** Điều tra các issue và đưa ra các quyết định, luôn tạo giải pháp thông minh vào file markdown trong plans trước.
- **Chỉ sửa code, không tự deploy:** Khi được yêu cầu fix hay triển khai gì đó, thì chỉ sửa về mặt code, không thực hiện deploy tới khi có yêu cầu.
- **Đồng bộ Đa Nền tảng (Cross-Platform Parity & Shared Knowledge):** Cả LINE và Telegram cùng phục vụ persona "Annie". Mọi cập nhật cấu hình hệ thống, thư viện tri thức tự học (`human_insights`), và guardrails phải luôn được thiết kế để dùng chung hoặc tự động đồng bộ 2 chiều giữa 2 dự án (`line-ai-chatbot-eab18` và `tele-ai-chatbot`), tránh phân mảnh tri thức.
- **Tối ưu Chi phí Tự học (Self-Learning Cost Minimization):** Đối với các tác vụ tự học về kỹ năng sống, tâm lý học, triết học và văn hóa (kiến thức nhân loại), ưu tiên cho LLM tự thân tổng hợp theo batch thay vì gọi API search bên ngoài. Bắt buộc có cơ chế cờ (`last_human_study_date`) để ngăn việc cả 2 bot cùng kích hoạt cron job gây lặp lại tác vụ và lãng phí token.

