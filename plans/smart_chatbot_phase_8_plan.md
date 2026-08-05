# Kế hoạch Nâng cấp Phase 8: The Polymath & Metacognitive Entity (Tối ưu hóa Chi phí)

**Mục tiêu**: Nâng cấp Annie thành **"Thực thể AI Nghệ thuật"** và sở hữu cơ chế **Tự tiến hoá**, nhưng BẮT BUỘC tuân thủ tuyệt đối các nguyên tắc trong `AGENTS.md`: Tối thiểu hoá chi phí (Zero-Cost), Tối ưu Token Prompt, và Không phình to System Prompt.

---

## 1. Tự Tiến hoá Trí tuệ (RAG Skill Vectors) - *[Tuân thủ Token Optimize & Hạn chế sửa System Prompt]*
Thay vì tiêm (inject) toàn bộ bài học vào System Prompt khiến prompt phình to theo thời gian (vi phạm Token Optimize):
- **Offline Epiphany**: Cronjob 3h sáng (`evolution.js`) tự động đọc `feedback_logs` và đúc kết thành các `Skill_Vectors` lưu vào Firestore. Quá trình này chạy ngầm ban đêm để tận dụng giá API rẻ nhất hoặc model cục bộ.
- **Contextual Injection (RAG)**: Khi chat, Bot chỉ trích xuất đúng Skill cần thiết. *Ví dụ: Nếu user bảo "Làm thơ đi", bot mới lôi Skill "Luật làm thơ" ra đưa vào prompt. Nếu user hỏi thời tiết, Skill này hoàn toàn bị ẩn.* Cơ chế này giữ cho Context Window luôn nhỏ nhất.

---

## 2. Nghệ sĩ Đa năng (Chain-of-Drafts có chọn lọc) - *[Tuân thủ Cost Minimization]*
- Sử dụng mô hình `deepseek-v4-pro` (thẻ `<think>`) để suy luận làm thơ/viết văn mạch lạc. 
- **Tối ưu chi phí**: Cơ chế Dual-Process Router trong `deepseek.js` sẽ lọc gắt gao. CHỈ KHI phát hiện intent nghệ thuật (Regex: `làm thơ|sáng tác|viết văn`), hệ thống mới switch sang model Reasoner. Các câu hỏi thông thường vẫn dùng Flash model để ép chi phí về mức tiệm cận 0.

---

## 3. Hoạ sĩ ASCII Art (Local Node.js) - *[Tuân thủ KISS & YAGNI & Zero-Cost]*
- Bắt LLM dùng `<think>` để vẽ ASCII Art sẽ tiêu tốn hàng ngàn token vô ích do tokenizer của AI không giỏi việc đếm khoảng trắng không gian.
- **Giải pháp Zero-Cost**: Bổ sung hàm regex nhận diện ý định vẽ ASCII. Khi kích hoạt, Bot KHÔNG gọi LLM mà gọi thẳng một thư viện Node.js có sẵn (ví dụ: `figlet`) để render ảnh ASCII trong 1 mili-giây, sau đó ném kết quả về cho user. Chi phí = 0 đồng, 0 token.

---

## 4. Deep Empathy (Batch Profiling) - *[Tuân thủ Hạn chế DB Read/Write]*
- Cập nhật MBTI/Hồ sơ tâm lý liên tục (Real-time) sẽ gây tốn kém khủng khiếp cho Firebase Read/Write.
- **Giải pháp Batch Processing**: Dồn toàn bộ việc phân tích tâm lý vào Cronjob 3h sáng (`evolution.js`). AI sẽ đọc lịch sử cả ngày, chấm điểm tính cách user và chỉ thực hiện ĐÚNG 1 LỆNH WRITE lưu 1 câu ngắn (Ví dụ: `MBTI: INFP, tone: trầm lắng`) vào `users/{userId}`. 
- **Cache RAM**: Khi user chat trong ngày, thông tin này được load 1 lần và lưu trong RAM (`getSessionMetadata`), không phát sinh thêm chi phí DB Read.
- **Persona Anchor**: Bổ sung "Mỏ neo tính cách" gọn gàng vào Prompt Tổng: *"Bạn là Annie, hãy linh hoạt tone giọng theo Hồ sơ tâm lý của user, nhưng tuyệt đối không hùa theo ý kiến sai trái."*

---

## Tóm tắt Lộ trình Thực thi
1. Tích hợp thư viện `figlet` tạo chức năng ASCII Art (Local, 0 cost).
2. Xây dựng collection `skill_vectors` (Dùng RAG để tiêm vào Prompt).
3. Nâng cấp `evolution.js` lúc 3h sáng: Phân tích tâm lý User (1 lần Write/ngày).
