# Kế hoạch Triển khai: Kho Kỹ năng Tự tiến hóa & Lệnh `/skills` (2026-11-22)

## 1. Mục tiêu
Xây dựng hệ thống **Self-Evolving Modular Skill Library + Just-in-Time Dynamic Prompt Injection** giúp bot Annie tự học, tinh chỉnh và kích hoạt các kỹ năng chuyên sâu (như làm thơ lục bát, review code, phân tích tài chính, dịch thuật tự nhiên...) một cách tự nhiên, tiết kiệm token tối đa và đồng bộ 2 chiều LINE ↔ Telegram.

## 2. Kiến trúc & Chi phí
1. **Lưu trữ tối ưu (`system_configs/bot_skills` + RAM Cache 5 phút):**
   - Toàn bộ kho kỹ năng lưu gọn trong 1 document `system_configs/bot_skills` (chỉ tốn **1 Firestore Read / 5 phút**), đồng bộ 2 chiều giữa `line-ai-chatbot-eab18` và `tele-ai-chatbot`.
   - Mỗi skill gồm: `slug`, `name`, `category`, `summary`, `triggers`, `prompt` (giới hạn cứng ≤ 70 từ ~100 tokens), `version`, `updatedAt`.
2. **Kích hoạt Động "Just-in-Time" ([skillLibrary.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/skillLibrary.js) & [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js)):**
   - Không đổ toàn bộ kho skill vào System Prompt.
   - Bộ `matchActiveSkill()` chạy offline (< 1ms, $0 API cost, so khớp có dấu & không dấu, ưu tiên cụm từ dài/đặc thù).
   - Chỉ tiêm **duy nhất 1 skill khớp nhất** kèm chỉ thị giữ giọng điệu Annie tự nhiên, thân thiện, tinh tế.
3. **Tự động Học & Tối ưu Hàng ngày (`dailySkillEvolution` trong [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js)):**
   - Chạy tách biệt với `dailyHumanStudy` lúc `03:00` sáng trong `masterScheduler`, dùng cờ riêng `last_skill_study_date` chống chạy lặp giữa 2 nền tảng.
   - Khởi tạo 10 skills nền tảng chất lượng cao; mỗi ngày dùng 1 batch DeepSeek (~$0.0005/ngày) để học thêm 1 skill mới (khi chưa đạt trần 30 skills) và/hoặc tinh chỉnh 1 skill cũ.
   - **2 lớp chống trùng lặp:** LLM Semantic Dedup (truyền danh sách hiện có, cấm trùng bản chất) + Code-level Dedup (check slug, tên không dấu, và >50% trigger overlap).
4. **Lệnh Quản lý trực tiếp trên Telegram ([skills.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/commands/skills.js) — $0 LLM cost):**
   - `/skills`: Liệt kê toàn bộ custom skills đã học theo nhóm.
   - `/skills_detail <tên skill>`: Tra cứu linh hoạt theo slug hoặc tên gần đúng, in chi tiết kèm toàn văn Custom Prompt từ Firestore.
