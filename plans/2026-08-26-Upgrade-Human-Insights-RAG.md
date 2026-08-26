# Kế hoạch triển khai: Nâng cấp Kho Triết lý Giao tiếp thành Thư viện Tri thức Động (Dynamic RAG Human Insights)

## 1. Bối cảnh & Mục tiêu
- **Vấn đề hiện tại**:
  1. Hàm `dailyHumanStudy()` lúc 3h sáng (`evolution.js`) giới hạn `human_insights` tối đa 5 câu, nén dồn hoặc cắt bỏ bài học cũ, làm mất đi các triết lý giao tiếp chuyên sâu được học qua thời gian.
  2. Toàn bộ 5 triết lý được bơm tĩnh vào System Prompt của mọi câu chat (`deepseek.js`), gây lãng phí token cho các câu hỏi thuần kỹ thuật/thời sự.
- **Mục tiêu**:
  1. Cho phép tích lũy **kho kiến thức lớn không giới hạn** về các triết lý giao tiếp, tâm lý học, ứng xử.
  2. Mỗi bài học gồm `topic`, `insight`, và `triggers` (từ khóa kích hoạt cảm xúc).
  3. **Context-Aware Dynamic Injection**: Chỉ khi người dùng có tín hiệu cảm xúc (buồn, giận, thất bại, cần lời khuyên, đùa vui...) mới quét và tiêm đúng 1 triết lý đắc địa nhất. Tiết kiệm 100% token cho câu hỏi thông thường.

## 2. Các thay đổi đề xuất
1. Cấu trúc lại dữ liệu `human_insights` trong Firestore `system_configs/bot_config` với `topic`, `insight`, `triggers`.
2. Nâng cấp `dailyHumanStudy()` trong `evolution.js` để tự động sinh cả `insight` và `triggers`, tích lũy không giới hạn vào kho tri thức.
3. Thêm hàm `matchRelevantInsight(prompt, insights)` trong `deepseek.js` để chỉ tiêm triết lý khi người dùng có cảm xúc/tình huống tương ứng.
4. Cập nhật `docs/features.md`.
