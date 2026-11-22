# Kế hoạch Triển khai: Hợp nhất Tri thức (Cross-Platform Insights Merge) & Nâng cấp Hệ thống Tự học Toàn diện (Comprehensive Self-Learning Framework)

## 1. Bối cảnh & Mục tiêu

### Vấn đề hiện tại:
1. **Phân mảnh dữ liệu**: Bot LINE có 15 bài học, Telegram có 10 bài học, lưu riêng ở 2 Firestore database độc lập, chưa dùng chung kho tri thức.
2. **Số lượng học ít và bị lặp**: Hàm `dailyHumanStudy()` trong `evolution.js` chỉ có 10 chủ đề cứng về kỹ năng mềm, mỗi ngày bốc ngẫu nhiên đúng 1 chủ đề, dẫn đến học đi học lại các chủ đề cũ và số lượng bài học không tăng trưởng.
3. **Phạm vi học còn hẹp**: Mới chỉ tập trung vào ứng xử khi buồn/giận (Empathy), chưa có các chiều kích giúp bot **thông thái, sâu sắc và giống người thật hơn** (Tư duy phản biện, Triết lý sống Stoic, Lối sống & Gu thưởng thức đời thường, Nghệ thuật đối đáp dí dỏm, Tâm lý học hành vi).

### Mục tiêu giải pháp:
1. **Hợp nhất (Merge & Dedup) bài học hiện có**: Gộp toàn bộ bài học của LINE và Telegram thành một bộ tri thức tinh hoa chung (~20 bài nền tảng), đồng bộ vào cả 2 database.
2. **Đồng bộ liên nền tảng (Cross-Platform Sync)**: Khi cron job học tập chạy ở bất kỳ môi trường nào, tự động cập nhật tri thức mới sang cả 2 dự án Firestore (`line-ai-chatbot-eab18` & `tele-ai-chatbot`).
3. **Tăng tốc độ học lên 10 bài/ngày**: Cấu hình cơ chế học 10 bài học mỗi ngày, tự động chọn các chủ đề chưa học hoặc các góc nhìn chuyên sâu mới.
4. **Mở rộng Kho Chủ đề Đa Tầng (6 Trụ Cột Tri Thức - Human Wisdom Pillars)**:
   - **Empathy & Connection**: Nghệ thuật giao tiếp thấu cảm, xoa dịu, lắng nghe sâu.
   - **Critical Thinking**: Tư duy phản biện, nhận diện bẫy tâm lý & ngụy biện (Sunk cost, Confirmation bias, Dunning-Kruger...).
   - **Practical Wisdom & Stoicism**: Triết lý sống thực tế, phân biệt điều kiểm soát được/không kiểm soát được, vượt qua hội chứng kẻ giả mạo, đối diện thất bại.
   - **Lifestyle, Culture & Sensory Pleasures**: Gu thưởng thức cuộc sống (cà phê, trà, slow living, ẩm thực đường phố, sạc lại năng lượng khi kiệt sức).
   - **Wit & Playful Banter**: Nghệ thuật đối đáp dí dỏm, tự trào duyên dáng, đảo chiều tình huống bất ngờ.
   - **Behavioral Psychology & Habit**: Thói quen tí hon, vượt qua trì hoãn, quản trị năng lượng.
5. **Cost Minimization ($0 Search Cost)**: Tận dụng tri thức sẵn có của LLM DeepSeek để đúc kết tri thức nhân loại, không lãng phí lượt search ngoài Tavily/Exa, chi phí chỉ ~$0.001/ngày (khoảng 25 VNĐ).
6. **Zero Prompt Bloat**: Cơ chế Dynamic Injection (`matchRelevantInsight`) vẫn chỉ tiêm đúng 1 insight thích hợp nhất khi gặp từ khóa kích hoạt, giữ prompt siêu gọn.

---

## 2. Các bước triển khai chi tiết

### Bước 1: Script hợp nhất & đồng bộ bài học hiện có (Merge & Sync Script)
- Trích xuất toàn bộ bài học từ Firestore của LINE (`line-ai-chatbot-eab18`) và Telegram (`tele-ai-chatbot`).
- Chuẩn hóa cấu trúc: `{ id, category, topic, insight, triggers }`.
- Khử trùng lặp và giữ lại các insight sắc bén nhất.
- Ghi đè bộ dữ liệu hợp nhất vào `system_configs/bot_config` của cả 2 database.

### Bước 2: Nâng cấp `functions/utils/evolution.js`
- Xây dựng kho chủ đề phong phú theo 6 trụ cột tri thức nhân loại (50+ chủ đề đa dạng).
- Nâng cấp `dailyHumanStudy()`:
  - Lấy danh sách các topic đã học trong `human_insights` hiện tại.
  - Chọn 10 chủ đề ưu tiên (chưa học hoặc cần đào sâu).
  - Yêu cầu DeepSeek phân tích và sinh 10 insight sắc sảo kèm bộ `triggers` chuẩn xác theo định dạng JSON.
  - Lưu vào Firestore của dự án hiện tại, đồng thời đồng bộ sang dự án thứ hai nếu có key.
  - Ghi log vào RTDB (`EVOLUTION_HUMAN_STUDY`) cho từng bài học để hiển thị đầy đủ trong `/learning`.

### Bước 3: Nâng cấp hàm matching trong `functions/utils/deepseek.js`
- Cải thiện hàm `matchRelevantInsight`: Ưu tiên trigger có độ dài lớn hơn hoặc độ khớp cao hơn để chọn ra insight đắt giá nhất theo ngữ cảnh người dùng.

### Bước 4: Kiểm thử và xác thực
- Chạy thử nghiệm hàm học 10 bài trên môi trường kiểm thử (hoặc chạy test script) để đảm bảo dữ liệu ghi đúng, không lỗi cú pháp.
- Kiểm tra báo cáo `/learning`.

### Bước 5: Cập nhật tài liệu kỹ thuật
- Cập nhật mục mới trong `docs/features.md`.
