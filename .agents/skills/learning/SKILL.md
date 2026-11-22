---
name: learning
description: |
  Tạo báo cáo những gì Bot đã học được (Tầm sư học đạo, Tự kiểm điểm lỗi, Học Facts từ user) trong 3-7 ngày qua.
  Trigger khi user gõ: /learning, "bot học được gì", "tầm sư học đạo"
---

# Skill: /learning — Báo cáo Tự Học (Self-Learning)

## Mục tiêu
Skill này giúp lập trình viên (Developer) và User xem lại những gì hệ thống Bot đã học được trong 3 đến 7 ngày qua. Nó sẽ tổng hợp dữ liệu từ Realtime Database của dự án.

## Cơ chế lấy dữ liệu & Kiến trúc Tự học
Hệ thống lấy dữ liệu trực tiếp từ `logs/system_logs` trên Firebase RTDB, bao gồm 3 loại sự kiện:
- `EVOLUTION_HUMAN_STUDY`: Học hỏi 10 bài học/ngày theo 6 Trụ Cột Tri Thức Nhân Loại (Cron job 3h sáng, đồng bộ 2 chiều LINE & Telegram).
- `EVOLUTION_GUARDRAIL`: Tự kiểm điểm lỗi thông qua Audit Logs (Cron job 3h sáng).
- `FACT_LEARNED`: Kiến thức (Facts) do cộng đồng dạy hoặc bot tự ghi nhớ.

### 6 Trụ Cột Tri Thức Nhân Loại (Human Wisdom Pillars):
1. **Thấu cảm & Giao tiếp (Empathy)**: Lắng nghe chủ động, thấu hiểu người hướng nội, mở lòng, nghệ thuật đặt câu hỏi.
2. **Tư duy phản biện (Critical Thinking)**: Bẫy chi phí chìm (Sunk cost), định kiến xác nhận, bẫy nhị nguyên, tách rời fact và feeling.
3. **Triết lý sống thực tế (Wisdom & Stoicism)**: Phân định điều kiểm soát được/không kiểm soát được, vượt qua hội chứng kẻ giả mạo (Imposter syndrome).
4. **Lối sống & Gu thưởng thức (Lifestyle)**: Khoảng lặng cà phê sáng, micro-joys, slow living, ẩm thực đường phố, sạc lại năng lượng.
5. **Hóm hỉnh & Đối đáp tinh tế (Wit)**: Tự trào duyên dáng, đảo chiều tình huống bất ngờ (twist), dùng hình ảnh ẩn dụ ngộ nghĩnh.
6. **Tâm lý học hành vi & Thói quen (Habits)**: Quy tắc 2 phút vượt qua trì hoãn, thói quen tí hon (Atomic habits), chống burnout.

## Quy trình thực hiện

### Bước 1: Thực thi script thống kê
Chạy lệnh sau trong terminal để lấy dữ liệu thống kê từ RTDB:
`node .agents/skills/learning/scripts/get_learning.js`

### Bước 2: Trình bày cho người dùng
- Trình bày kết quả ra màn hình cho người dùng một cách chuyên nghiệp.
- Nếu không có dữ liệu, hãy hiển thị câu an ủi (ví dụ: Bot dạo này đang chăm sóc User nên bận, chưa học được gì thêm).
