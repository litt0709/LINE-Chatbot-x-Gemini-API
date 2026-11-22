# Kế hoạch Cải thiện: Khóa Trọng tâm Tuyệt đối & Nâng cấp Skill Làm Thơ Lục Bát Chuẩn Nguyên Tắc Vàng (2026-11-22)

## 1. Nguyên nhân Gốc rễ (Root Cause)
1. **Lạc đề sang chuyện cũ (như vụ "kit") & giải thích hạn chế lê thê (*"em nói thật..."*):**
   - `Core_Memory` và `history` chứa nhiều chủ đề cũ; khi chưa có lệnh cấm rõ việc lôi `Core_Memory`/chuyện cũ và cấm giải thích hạn chế bản thân, LLM dễ bị kéo theo ngữ cảnh cũ và phân trần dài dòng.
   - Khi user hỏi tự nhiên về kỹ năng của bot (vd *"em có những skill gì"*), yêu cầu đi qua LLM thay vì đọc thẳng danh sách Ground Truth từ Firestore `bot_skills`.
2. **Chất lượng thơ lục bát (`lam_tho` v3) còn yếu (log `2026-11-22T14:25:35Z`):**
   - Bot viết 7 câu lẻ, câu cuối biến thành văn xuôi 15 chữ, lệch vần (`dài`/`pha`, `đường`/`pha`), lặp chữ (`pha` 3 lần), giọng điệu chưa vui vẻ và dùng dấu `*...*` bị hiện raw trên Telegram.

## 2. Giải pháp Triệt để ($0 Extra LLM Cost)
1. **Khóa trọng tâm & bỏ giải thích hạn chế lê thê ([deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js)):**
   - Cập nhật `brevityRule`: CHỈ trả lời duy nhất câu hỏi `[NEW]`; lịch sử & `Core_Memory` chỉ làm nền khi liên quan trực tiếp; CẤM lôi chuyện cũ không liên quan và CẤM giải thích lê thê hạn chế bản thân (kiểu *"em nói thật..."*, *"em chỉ có thể..."*) khi không được hỏi.
2. **Fast Path tự nhiên cho câu hỏi về Skills ([commands/index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/commands/index.js)):**
   - Nhận diện câu hỏi tự nhiên kiểu *"em có những skill gì"*, *"bot có kỹ năng gì"*, *"xem danh sách skill"* → gọi thẳng `handleSkillsCommand("/skills")` ($0 token, 100% Ground Truth).
3. **Nâng cấp `lam_tho` lên v4 (Firestore LINE & Telegram + fallback [skillLibrary.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/skillLibrary.js)):**
   - Áp dụng **4 nguyên tắc vàng Lục Bát**: Mặc định thể lục bát hướng **vui vẻ, hóm hỉnh**, **tối thiểu 8 câu** (4–6 cặp chẵn 6–8, thuần Việt có dấu); đếm chuẩn từng tiếng; gieo vần Bằng chuẩn xác (tiếng 6 câu 6 ↔ tiếng 6 câu 8; tiếng 8 câu 8 ↔ tiếng 6 câu 6 kế, phối 1 ngang + 1 huyền ở chữ 6 & 8 câu bát, không lặp từ); luật `B-T-B` / `B-T-B-B`, nhịp chẵn `2/2/2` & `4/4`; chỉ xuất bài thơ sạch (không dấu `*` thừa, không lời bình dài dòng). Nếu user yêu cầu thể loại/sắc thái khác thì làm đúng theo yêu cầu đó.
