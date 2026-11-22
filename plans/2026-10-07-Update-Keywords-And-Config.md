# Kế hoạch Cập nhật Cấu hình Dynamic và Dọn dẹp Audit Logs (2026-10-07)

## 1. Mục tiêu
- Trích xuất toàn bộ dữ liệu audit tồn đọng trong collection `audit_logs` (gồm 59 documents trên LINE Firestore).
- Phân loại, chuẩn hóa và gộp (merge) các từ khóa/chủ đề mới vào Document `bot_config` trong collection `system_configs` trên cả 2 Firestore projects (`line-ai-chatbot-eab18` và `tele-ai-chatbot`):
  - `search_keywords` (các danh mục: DEV, FINANCE, SOCIAL, NEWS, GENERAL).
  - `standalone_topics` (danh sách chủ đề độc lập).
  - `proactive_trigger_words` (các từ khóa kích hoạt can thiệp chủ động).
- Làm sạch các từ rác ("xin link...", "ở đâu"...) vô tình bị lẫn vào `search_keywords` từ các phiên trước.
- Đảm bảo toàn bộ chuỗi Regex an toàn cú pháp (Valid Regex Check).
- Thực thi dọn dẹp triệt để (Inbox Zero): Xóa các trường dữ liệu audit đã xử lý (`audit_keywords`, `missed_topics`, `missed_proactive_keywords`, `missed_link_requests`, `missed_entities`) khỏi `audit_logs`. Nếu document không còn trường dữ liệu nào khác thì xóa Document ID để giữ database gọn gàng.

## 2. Thống kê Dữ liệu Thu thập được
- **Keywords theo Category:**
  - `DEV`: 122 từ khóa mới (ví dụ: Claude, microservice, k8s, A.I LLM, AI code, GPU, KV cache, Qwen 3.8 flash next, Opus 5.5, omni channel...).
  - `FINANCE`: 58 từ khóa mới (ví dụ: momo, Vin hốt bạc, bảo hiểm thất nghiệp, rút bhxh 1 lần, AI chứng khoán, lãi suất, bất động sản, đất miền nam, giá đất...).
  - `SOCIAL`: 59 từ khóa mới (ví dụ: CGV, thapcamtv, LCK tiếng Việt, Liên Quân, Maimai, 2 quốc tịch, BK alumni...).
  - `NEWS`: 56 từ khóa mới (ví dụ: Tây Hồ, Line HCM, thu hồi, vượt đèn đỏ, TQ ra tay, 800 TỶ XUỐNG CÒN 8 TỶ, 163.com, Oracle...).
  - `GENERAL`: 190 từ khóa mới (ví dụ: CellphoneS, FPT, Sài Gòn, ping pong, Nocturia, tất nén, cafe Môck, resort Hòa Bình...).
- **Chủ đề Độc lập (Missed Topics):** 66 chủ đề mới (ví dụ: AI trong Y học cổ truyền, Tối ưu hóa LLM, AI cache và KV cache, Phần cứng và hạ tầng cho AI, ZeroClaw, v.v.).
- **Từ khóa Bế tắc / Cần trợ giúp (Missed Proactive Keywords):** 81 cụm từ (ví dụ: bế tắc, không hiểu, chịu, lo lắng suốt, khó thật, đau não, chả có j làm dc, loay hoay, sốt ruột, toang, v.v.).

## 3. Kế hoạch Thực thi
1. Viết script `functions/scratch/execute_update_config.js`:
   - Kết nối Firestore cả 2 project (`line-ai-chatbot-eab18` và `tele-ai-chatbot`).
   - Đọc `bot_config` hiện tại, gộp các mục mới một cách an toàn (tránh trùng lặp, chuẩn hóa chữ thường, lọc từ vô nghĩa).
   - Kiểm tra Regex compile trước khi lưu để đảm bảo tuyệt đối không lỗi cú pháp.
   - Ghi lại vào Firestore `system_configs/bot_config`.
## 4. Kết quả Thực hiện (Execution Results)
- Đã trích xuất và xử lý toàn bộ 60 documents tồn đọng trong `audit_logs`.
- Đã làm sạch hoàn toàn các từ rác ("xin link...", "ở đâu"...) khỏi các chuỗi phân loại regex.
- Đã cập nhật thành công Document `system_configs/bot_config` trên cả LINE (`line-ai-chatbot-eab18`) và Telegram (`tele-ai-chatbot`):
  - **LINE bot_config:**
    - `DEV`: 408 từ khóa
    - `FINANCE`: 243 từ khóa
    - `SOCIAL`: 224 từ khóa
    - `NEWS`: 403 từ khóa
    - `GENERAL`: 582 từ khóa
    - `standalone_topics`: 299 chủ đề (+64 chủ đề mới)
    - `proactive_trigger_words`: 170 từ (+74 từ khóa mới)
    - `leak_blacklist`: 11 mẫu
  - **TELEGRAM bot_config:**
    - `DEV`: 138 từ khóa
    - `FINANCE`: 80 từ khóa
    - `SOCIAL`: 79 từ khóa
    - `NEWS`: 75 từ khóa
    - `GENERAL`: 221 từ khóa
    - `standalone_topics`: 80 chủ đề (+66 chủ đề mới)
    - `proactive_trigger_words`: 99 từ (+79 từ khóa mới)
- **Dọn dẹp Database (Inbox Zero):** Đã xóa toàn bộ 60 documents khỏi collection `audit_logs`. Hiện collection hoàn toàn sạch sẽ (0 documents).

