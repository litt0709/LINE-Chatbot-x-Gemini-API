---
name: update
description: Kết nối Firestore lấy search keywords log, tiến hành phân tích và tự động update vào source code.
---

Khi người dùng gõ lệnh `/update`, bạn (AI) PHẢI thực hiện đúng quy trình sau:

1. **Lấy dữ liệu (Fetch Data):**
   - Viết và chạy một script Node.js (dùng `firebase-admin` với file `service-account.json` hoặc `line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json` có sẵn trong thư mục `functions/auth/`) trong thư mục `scratch/` để truy vấn collection `audit_keywords` trên Firestore.
   - Trích xuất danh sách `audit_keywords`, `missed_link_requests`, `missed_topics`, `missed_entities` từ các log gần đây.
   - Đồng thời trích xuất các câu hỏi của người dùng (`user_question`) từ mảng `audit_issues` có `issue_type === "prompt_leakage"`.

2. **Phân tích (Analyze):**
   - Phân tích các từ khóa `audit_keywords` cần thiết cho các nhóm (NEWS, FINANCE, GENERAL, v.v.).
   - Phân tích các cụm từ xin link trong `missed_link_requests`.
   - Phân tích các chủ đề độc lập trong `missed_topics`.
   - Phân tích các tên riêng/thực thể bị miss trong `missed_entities`.

3. **Cập nhật Source Code (Update Code):**
   - Bổ sung `audit_keywords` vào đúng cụm Regex của category tương ứng trong `functions/utils/search.js`.
   - Bổ sung `missed_entities` vào trong lòng Regex `vnSurnamesAndEntities` trong `functions/utils/search.js`.
   - Bổ sung `missed_link_requests` vào cụm Regex xin link (`/xin link|.../i`) ở đầu hàm `chat()` trong `functions/utils/deepseek.js`.
   - Bổ sung `missed_topics` vào mảng `STANDALONE_TOPICS` (định dạng regex `/chủ đề/i`) trong `functions/utils/deepseek.js`.
   - Với các câu hỏi gài bẫy prompt phát hiện được ở Bước 2, Agent tiến hành phân tích rút ra các cụm từ khóa gài bẫy cốt lõi, chuẩn hóa về dạng viết thường, không dấu và append (thêm) chúng vào tệp JSON [leak_blacklist.json](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/leak_blacklist.json) (không được để trùng lặp trong mảng JSON).
   
4. **Dọn dẹp (Cleanup - Inbox Zero):**
   - BẮT BUỘC thực thi script Node.js để xóa các trường dữ liệu `audit_keywords`, `missed_link_requests`, `missed_topics`, `missed_entities` đã xử lý trong các documents thuộc collection `audit_logs` trên Firestore (dùng `FieldValue.delete()`). NẾU document sau khi xóa không còn chứa dữ liệu audit nào khác (ví dụ: `audit_issues`), thì tiến hành xóa luôn Document ID đó để giữ database sạch sẽ.

5. **Báo cáo (Report):**
   - Tóm tắt lại những từ khóa, cụm từ xin link và chủ đề mới nào đã được update vào hệ thống.
