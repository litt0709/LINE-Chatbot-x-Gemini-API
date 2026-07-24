---
name: docs
description: |
  Dùng khi user yêu cầu update tài liệu kỹ thuật trong folder docs/ của dự án.
  Trigger khi user gõ: /docs, "update docs", "cập nhật tài liệu", "cập nhật docs", "viết docs lại"
---

# Skill: /docs — Update Technical Documentation

## Mục tiêu
Đọc lại toàn bộ source code mới nhất và cập nhật 2 file tài liệu kỹ thuật:
- `docs/architecture.md` — Kiến trúc tổng thể hệ thống (ASCII diagram, phân lớp, data flow, bảng chi phí)
- `docs/specs.md` — Luồng logic chi tiết của từng module, cấu trúc dữ liệu, biến môi trường

## Quy trình thực hiện

### Bước 1: Đọc Source Code mới nhất

Đọc các file sau theo thứ tự (song song nếu có thể):

```
functions/index.js           — Webhook chính + MasterScheduler
functions/utils/db.js        — RTDB + Firestore + RAM Cache helpers
functions/utils/llm.js       — LLM Router
functions/utils/deepseek.js  — DeepSeek chat logic, system prompt builder
functions/utils/gemini.js    — Gemini multimodal, summarizeHistory
functions/utils/search.js    — Web context resolver
functions/utils/news.js      — Daily news digest
functions/utils/tavily.js    — Tavily API wrapper
functions/utils/exa.js       — Exa API wrapper
functions/utils/line.js      — LINE API wrapper
functions/utils/telegram.js  — Telegram API wrapper
```

### Bước 2: Phân tích thay đổi

Với mỗi file, xác định:
- Các hàm mới được thêm vào hoặc bị xóa
- Logic quan trọng thay đổi (ví dụ: điều kiện, flow control, API thay thế)
- Cấu trúc dữ liệu RTDB/Firestore mới
- Biến môi trường mới

### Bước 3: Cập nhật `docs/architecture.md`

Cập nhật (Overwrite) file `docs/architecture.md` với các thông tin sau:

**Bắt buộc có:**
- ASCII Art sơ đồ kiến trúc tổng thể (cập nhật nếu có module mới)
- Bảng phân lớp kiến trúc (Request Layer, Processing Layer, LLM Layer, Storage Layer, Search Layer)
- Data Flow sơ đồ khi chat (mũi tên ASCII)
- Bảng chi phí theo hành động (RTDB reads/writes, Firestore reads/writes, Gemini calls, DeepSeek calls)
- Bảng môi trường triển khai (Project IDs, Webhook URLs)
- Phần cập nhật phiên bản (ghi ngày cập nhật hiện tại)

### Bước 4: Cập nhật `docs/specs.md`

Cập nhật (Overwrite) file `docs/specs.md` với các thông tin sau:

**Bắt buộc có:**
- Bảng tổng quan module (tất cả file + chức năng)
- Luồng xử lý chi tiết cho TỪNG luồng chính:
  1. Chat Text thường (Telegram + LINE riêng biệt)
  2. Lazy Image Processing (placeholder + on-demand download)
  3. Web Context Resolution (Search Decision Tree)
  4. DeepSeek Chat function (từng Step với chú thích)
  5. MasterScheduler (Cron tasks)
  6. Hybrid Memory (3 tầng RAM/RTDB/Firestore)
- Các logic hỗ trợ đặc biệt (Profile Extraction, Topic Sync, Quick Reply, Mention Resolution, Whitelist)
- Cấu trúc dữ liệu RTDB (cây thư mục với field types)
- Cấu trúc dữ liệu Firestore (cây thư mục với field types)
- Bảng biến môi trường (Biến + Mục đích)

### Bước 5: Xác nhận hoàn thành

Sau khi viết xong:
- Kiểm tra 2 file tồn tại và có nội dung đầy đủ
- Báo cáo cho user: "Đã cập nhật docs/architecture.md và docs/specs.md thành công!"
- Liệt kê ngắn gọn những thay đổi chính được ghi lại trong lần update này

## Yêu cầu chất lượng tài liệu

- **CHI TIẾT**: Mỗi luồng xử lý phải có tất cả các bước, không bỏ sót
- **ĐA CHIỀU**: Phân tích cả góc độ kiến trúc, chi phí, bảo mật, hiệu năng
- **CỐT LÕI**: Nêu bật insight quan trọng (ví dụ: tại sao dùng RTDB thay Firestore cho chat thường)
- **ASCII Art**: Dùng ký tự ASCII để vẽ sơ đồ, luồng, cây thư mục
- **Bảng Markdown**: Dùng bảng để so sánh, liệt kê thông tin có cấu trúc
- **Cập nhật ngày**: Luôn ghi ngày cập nhật mới nhất ở đầu file

## Lưu ý

- Dùng `Overwrite: true` khi ghi đè file docs đã tồn tại
- Không deploy khi thực hiện task này, chỉ cập nhật tài liệu
- Nếu có thay đổi lớn về kiến trúc (ví dụ: thêm platform mới, đổi LLM), hãy cập nhật ASCII art
