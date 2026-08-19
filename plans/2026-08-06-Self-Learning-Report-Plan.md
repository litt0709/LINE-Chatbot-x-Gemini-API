# Kế hoạch triển khai tính năng: Báo cáo Tự Học (Self-Learning Report)

**Mục tiêu (Goal):** 
Báo cáo lại quá trình Bot tự nâng cấp trí thông minh, "tầm sư học đạo" (Human Insights), tự fix lỗi (Guardrails) và học hỏi kiến thức mới từ user (Facts).
Thời gian lấy dữ liệu là 3 ngày gần nhất, nếu không có gì sẽ tự động lùi về 7 ngày.

**Tuân thủ tiêu chí hệ thống (`AGENTS.md`):**
- Tối thiểu hóa chi phí (Cost Minimization)
- Tối ưu Tokens (Token Optimize)
- DRY, KISS (Tận dụng hệ thống log hiện có)

---

## 1. Giải pháp lưu trữ (Data Source) - Zero Cost Write
Hiện tại, module `evolution.js` đã tự động ghi log vào Realtime Database (RTDB) tại đường dẫn `logs/system_logs/{YYYY-MM-DD}` thông qua `logger.logSystem()` với các action:
- `EVOLUTION_HUMAN_STUDY` (Tầm sư học đạo)
- `EVOLUTION_GUARDRAIL` (Tự kiểm điểm lỗi)

**Thay đổi cần thiết:** 
Trong `functions/utils/db.js` tại hàm `saveFact()`, ta chỉ cần thêm 1 dòng gọi `logger.logSystem('FACT_LEARNED', 'Đã học fact mới: ...')`. 
=> **Ưu điểm:** Biến `system_logs` trên RTDB thành điểm tập trung duy nhất cho mọi hoạt động học hỏi. Việc đọc/ghi RTDB là **hoàn toàn miễn phí**, thỏa mãn tuyệt đối tiêu chí Cost Minimization.

---

## 2. Giải pháp truy xuất & Xử lý (Retrieval Logic)
Tạo một hàm tiện ích `getLearningReport(botPlatform)`:
1. Lấy ngày hiện tại (YYYY-MM-DD) và lùi dần về quá khứ.
2. Vòng lặp 1: Quét 3 ngày gần nhất trên RTDB `logs/system_logs`.
3. Lọc các sự kiện thuộc mảng `['EVOLUTION_HUMAN_STUDY', 'EVOLUTION_GUARDRAIL', 'FACT_LEARNED']`.
4. Nếu số lượng tìm thấy > 0, dừng lại và format thành chuỗi báo cáo.
5. Nếu số lượng = 0, chạy tiếp Vòng lặp 2: Quét lùi đến 7 ngày. Nếu vẫn không có, trả về thông báo "Bot dạo này đang lười, chưa học thêm được gì".

---

## 3. Cách thức kích hoạt (Trigger Mechanism)

Theo yêu cầu "Có thể hỏi qua agent skill command hoặc trao đổi với bot", giải pháp được thiết kế tối ưu token nhất như sau:

### A. Đối với IDE Agent (Skill Command)
Tạo mới file skill `.agents/skills/learning/SKILL.md`:
- **Triggers:** `/learning`, "bot học được gì", "tầm sư học đạo".
- **Hành động:** Agent sử dụng script kết nối Firebase Admin đọc RTDB (hoặc sử dụng hàm có sẵn), tự phân tích và trả báo cáo trực tiếp cho User (Dev) trên cửa sổ IDE.

### B. Đối với Bot Chat (Trao đổi trực tiếp qua LINE/Telegram)
Để tránh việc dùng LLM Tool Calling (tốn Token cho System Prompt mỗi lần gọi) theo chuẩn *General Prompt & Token Optimize*, ta sử dụng kỹ thuật **Regex Pre-processing** trong `index.js`:

- Bắt Regex: `/(mày|bạn|em|bot).*(học được gì|tầm sư học đạo|nâng cấp trí thông minh)/i`
- Nếu khớp: Bot gọi `getLearningReport()` và trả lời **trực tiếp** cho người dùng (Zero-cost, hoàn toàn không tốn 1 đồng phí LLM nào).
- Nội dung trả lời (Ví dụ):
  ```text
  🎓 [Báo cáo Tự Học]
  Trong 3 ngày qua, em đã học được:
  
  🧠 Tầm sư học đạo:
  - "Luôn lắng nghe trước khi khuyên bảo"
  
  🛡️ Tự sửa lỗi:
  - "CẤM lặp lại lỗi sai kiến thức về Next.js"
  
  📚 Từ cộng đồng:
  - Học Fact: Cấu hình Firebase
  ```

---

## Phản hồi từ sếp (Review)

Phương án B (Bot Chat) ưu tiên trả lời **trực tiếp** bằng mã cứng (Hardcode template) khi bắt trúng Regex để **tiết kiệm 100% token**. 
Tuy nhiên, nếu sếp muốn Bot trả lời một cách "tự nhiên và mượt mà" hơn (theo văn phong của LLM), chúng ta có thể tiêm kết quả `getLearningReport()` vào prompt dưới dạng `<SYSTEM_INFO>` và để LLM tự generate câu trả lời (tốn thêm Token). Sếp ưu tiên cách nào?
