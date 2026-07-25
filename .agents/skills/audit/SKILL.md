---
name: audit
description: Kết nối Firestore lấy audit logs (issues), phân tích hallucination và đề xuất cách sửa code/prompt.
---

Khi người dùng gõ lệnh `/audit`, bạn (AI) PHẢI thực hiện đúng quy trình sau:

1. **Lấy dữ liệu (Fetch Data):**
   - Viết hoặc sử dụng một script Node.js (kết hợp `firebase-admin` và `service-account.json`) trong thư mục `scratch/` để query collection `audit_logs` trên Firestore.
   - Trích xuất toàn bộ mảng `audit_issues` từ các tài liệu gần đây.

2. **Phân tích (Analyze):**
   - Đọc kỹ từng issue: Đối chiếu giữa "Câu hỏi của User" (user_question), "Dữ liệu gốc từ Search" (tavily_raw), và "Câu trả lời bị lỗi của Bot" (bot_answer).
   - Xác định nguyên nhân bot bị ảo giác (Hallucination) hoặc trả lời ngớ ngẩn.

3. **Gợi ý giải pháp (Propose Fixes):**
   - Dựa trên phân tích, đưa ra các gợi ý cụ thể để sửa lỗi (điều chỉnh System Prompt hoặc logic tìm kiếm).
   - Khi đề xuất sửa đổi System Prompt, PHẢI tuân thủ 3 nguyên tắc cốt lõi sau:
     + **General Prompt (Tính tổng quát):** Không viết rule kiểu hardcode cứng nhắc chỉ để trị một case cụ thể. Hãy viết rule bao quát để bot tự suy luận được cho các trường hợp tương tự trong tương lai.
     + **Token Optimize (Tối ưu Token):** Viết rule cực kỳ ngắn gọn, dùng từ ngữ súc tích, mang tính hiệu lệnh mạnh (VD: "TUYỆT ĐỐI", "BẮT BUỘC"). Loại bỏ những từ thừa thãi để tiết kiệm chi phí token cho mỗi request.
     + **Tuyệt đối chính xác câu trả lời:** Đảm bảo prompt mới không vô tình bóp méo luồng suy nghĩ của bot, buộc bot phải ưu tiên dữ liệu thật (fact) lên hàng đầu, tránh rủi ro tự bịa chuyện (Zero Hallucination).
   - Khi đề xuất sửa đổi Mã nguồn (Code), PHẢI tuân thủ QUY TẮC TỐI THƯỢNG sau:
     + **Tối thiểu chi phí (Cost Minimization):** Ưu tiên sử dụng Regex, logic xử lý thuần túy (JS offline) hoặc bộ nhớ đệm (Cache) để giải quyết vấn đề thay vì đẩy phần việc đó cho AI. TUYỆT ĐỐI HẠN CHẾ việc thiết kế thêm lệnh gọi API của LLM, Search Engine hoặc các dịch vụ tốn phí khác nếu không thực sự cấp bách. Mọi dòng code mới phải được tối ưu để không làm tăng gánh nặng chi phí vận hành.

4. **Trình duyệt (Review):**
   - Trình bày rõ ràng các vấn đề và giải pháp cho Developer (Sếp) duyệt. CHỈ tiến hành sửa code sau khi Sếp đồng ý.
   - Sau khi fix xong, BẮT BUỘC thực thi script Node.js để xóa trường dữ liệu `audit_issues` đã xử lý trong các documents thuộc collection `audit_logs` trên Firestore (dùng `FieldValue.delete()`). NẾU document sau khi xóa không còn chứa dữ liệu audit nào khác (ví dụ: `audit_keywords`), thì tiến hành xóa luôn Document ID đó để giữ database sạch sẽ.
