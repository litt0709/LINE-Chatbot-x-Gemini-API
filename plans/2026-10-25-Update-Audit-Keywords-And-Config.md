# Kế hoạch Triển khai: Cập nhật Cấu hình Tìm kiếm & Tối ưu Hệ thống từ Audit Logs (/update) — 2026-10-25

## 1. Bối cảnh & Mục tiêu

Sau khi phân tích toàn bộ 36 tài liệu trong `audit_logs` trên Firestore, hệ thống đã ghi nhận:
- **`audit_keywords`**: 278 từ khóa tìm kiếm mới do người dùng kích hoạt trong các cuộc trò chuyện.
- **`missed_link_requests`**: 2 cụm từ người dùng yêu cầu phân tích/hỏi link website (`"đọc link tin này tổng hợp và đánh giá"`, `"có trang đó à"`).
- **`missed_topics`**: 34 chủ đề người dùng quan tâm (xe điện, công nghệ pin, hydrogen, phong thuỷ, tử vi, thị trường lao động, triết lý kinh doanh...).
- **`missed_proactive_keywords`**: 50 cụm từ thể hiện trạng thái bế tắc/cần hỗ trợ/tâm sự trong nhóm chat.
- **`prompt_leakage_questions`**: 0 câu hỏi gài bẫy prompt.

Mục tiêu:
1. Phân loại và nạp các từ khóa vào các nhóm `search_keywords` (`TECH`, `DEV`, `FINANCE`, `SOCIAL`, `NEWS`, `GENERAL`) trong `system_configs/bot_config`.
2. Bổ sung cụm từ xin link vào `link_requests_regex`.
3. Bổ sung các chủ đề vào `standalone_topics`.
4. Bổ sung các cụm từ bế tắc vào `proactive_trigger_words`.
5. Đồng bộ cấu hình lên cả 2 database: LINE (`line-ai-chatbot-eab18`) và Telegram (`tele-ai-chatbot`) theo nguyên tắc Cross-Platform Parity.
6. Dọn dẹp (Inbox Zero): Xóa các trường audit đã xử lý và xóa các document rỗng để giữ Firestore sạch sẽ.

---

## 2. Quy trình Thực hiện

### Bước 1: Tiền xử lý & Khử trùng lặp
- Lọc bỏ các từ khóa quá ngắn (dưới 2 ký tự), từ sáo rỗng hoặc từ đã tồn tại trong chuỗi regex hiện tại của từng nhóm.
- Chuẩn hóa chữ thường (lowercase) cho `proactive_trigger_words` và các từ khóa regex.

### Bước 2: Nạp dữ liệu vào Firestore `system_configs/bot_config`
- Đọc `bot_config` hiện tại từ cả LINE và Telegram.
- Ghép nối regex: `categoryRegex = [...existingWords, ...newUniqueWords].join("|")`.
- Hợp nhất mảng: `standalone_topics = Array.from(new Set([...existingTopics, ...newTopics]))`.
- Hợp nhất mảng: `proactive_trigger_words = Array.from(new Set([...existingTriggers, ...newTriggers]))`.
- Cập nhật cả 2 dự án.

### Bước 3: Dọn dẹp (Cleanup - Inbox Zero)
- Quét qua 36 document trong `audit_logs` của LINE.
- Dùng `FieldValue.delete()` để xóa các trường: `audit_keywords`, `missed_link_requests`, `missed_topics`, `missed_entities`, `missed_proactive_keywords`, `suggested_stopwords`.
- Vì các document này không chứa `audit_issues` (hoặc `audit_issues` rỗng), tiến hành xóa luôn Document ID để đưa `audit_logs` về trạng thái Inbox Zero.

### Bước 4: Báo cáo kết quả chi tiết
- Tóm tắt số lượng từ khóa đã nạp vào từng nhóm, các chủ đề mới và các triggers can thiệp chủ động.
