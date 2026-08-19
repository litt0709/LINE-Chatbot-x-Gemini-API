---
name: learning
description: |
  Tạo báo cáo những gì Bot đã học được (Tầm sư học đạo, Tự kiểm điểm lỗi, Học Facts từ user) trong 3-7 ngày qua.
  Trigger khi user gõ: /learning, "bot học được gì", "tầm sư học đạo"
---

# Skill: /learning — Báo cáo Tự Học (Self-Learning)

## Mục tiêu
Skill này giúp lập trình viên (Developer) và User xem lại những gì hệ thống Bot đã học được trong 3 đến 7 ngày qua. Nó sẽ tổng hợp dữ liệu từ Realtime Database của dự án.

## Cơ chế lấy dữ liệu
Hệ thống lấy dữ liệu trực tiếp từ `logs/system_logs` trên Firebase RTDB, bao gồm 3 loại sự kiện:
- `EVOLUTION_HUMAN_STUDY`: Học hỏi kiến thức/kỹ năng mềm tự động (Cron job 3h sáng).
- `EVOLUTION_GUARDRAIL`: Tự kiểm điểm lỗi thông qua Audit Logs (Cron job 3h sáng).
- `FACT_LEARNED`: Kiến thức (Facts) do cộng đồng dạy hoặc bot tự ghi nhớ.

## Quy trình thực hiện

### Bước 1: Thực thi script thống kê
Chạy lệnh sau trong terminal để lấy dữ liệu thống kê từ RTDB:
`node .agents/skills/learning/scripts/get_learning.js`

### Bước 2: Trình bày cho người dùng
- Trình bày kết quả ra màn hình cho người dùng một cách chuyên nghiệp.
- Nếu không có dữ liệu, hãy hiển thị câu an ủi (ví dụ: Bot dạo này đang chăm sóc User nên bận, chưa học được gì thêm).
