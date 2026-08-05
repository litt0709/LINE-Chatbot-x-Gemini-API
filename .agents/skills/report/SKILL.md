---
name: report
description: |
  Tạo báo cáo thống kê Token và Chi phí (Cost) hàng ngày của DeepSeek.
  Trigger khi user gõ: /report, "thống kê token", "báo cáo chi phí", "hôm nay hết bao nhiêu tiền"
---

# Skill: /report — Báo cáo Chi phí Token

## Mục tiêu
Đọc dữ liệu token từ RTDB và tính toán chi phí (USD) dựa trên bảng giá của DeepSeek, sau đó hiển thị báo cáo chi tiết cho người dùng dưới dạng bảng Markdown.

## Bảng giá DeepSeek (Per 1M Tokens)
- `deepseek-v4-flash`: Prompt = $0.07 | Completion = $0.14
- `deepseek-v4-pro`: Prompt = $0.55 | Completion = $2.19

## Quy trình thực hiện

### Bước 1: Thực thi script thống kê
Chạy lệnh sau trong terminal để lấy dữ liệu thống kê từ RTDB:
`cd functions && node ../.agents/skills/report/scripts/generate_report.js`

### Bước 2: Phân tích kết quả
Script sẽ trả về một chuỗi JSON chứa dữ liệu thống kê của 7 ngày gần nhất (bao gồm số lượng Prompt Tokens, Completion Tokens, và tổng chi phí của từng ngày).

### Bước 3: Xuất báo cáo cho User
Trình bày kết quả bằng một bảng Markdown đẹp mắt và chuyên nghiệp.

**Format yêu cầu:**
- Bảng 1: Thống kê tổng quan các ngày (Ngày, Tổng Token, Tổng Chi Phí USD).
- Bảng 2: Chi tiết ngày HÔM NAY (chia theo model Flash và Pro, Input/Output).
- Dùng GitHub Alerts (VD: `> [!NOTE]`) để ghi chú thêm rằng dữ liệu được track với chi phí 0đ thông qua RTDB.

**Lưu ý:**
- Bắt buộc phải chạy script bằng lệnh Node để kéo dữ liệu thật từ Database trước khi generate report. KHÔNG ĐƯỢC BỊA SỐ LIỆU.
- Định dạng USD với 4 chữ số thập phân (VD: `$0.0012`).
