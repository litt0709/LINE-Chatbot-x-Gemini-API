# Kế hoạch Chuyển Đổi LLM DeepSeek về deepseek-chat & Tạm Dừng deepseek-v4-pro

## 1. Mục tiêu
- Do chi phí vận hành tăng cao khi sử dụng các model DeepSeek-V4 (đặc biệt là `deepseek-v4-pro`), chuyển toàn bộ luồng chat và phân tích sang `deepseek-chat` (DeepSeek-V3).
- Tạm thời disable `deepseek-v4-pro` đối với các câu phân tích phức tạp, chuyển sang dùng `deepseek-chat` cho các yêu cầu này.
- Đảm bảo tính nhất quán giữa cấu hình mặc định, timeout, cơ chế fallback, lệnh `/report` và `/health`, cũng như tài liệu dự án (`docs/features.md`, `docs/specs.md`).

## 2. Phân tích chi tiết thay đổi
1. **`functions/utils/deepseek.js`**:
   - `DEEPSEEK_MODEL`: Đổi default fallback từ `"deepseek-v4-flash"` thành `"deepseek-chat"`.
   - **Dual-Process Classifier**: Tạm thời vô hiệu hóa việc định tuyến câu hỏi phức tạp sang `deepseek-v4-pro`. Giữ `targetModel = DEEPSEEK_MODEL` (`deepseek-chat`) cho tất cả các câu hỏi (kể cả phân tích/code/dài).
   - **Timeout & Retry/Fallback**:
     - Cập nhật timeout thống nhất cho `deepseek-chat` (25000ms).
     - Luồng retry 2 lần khi gặp lỗi mạng.
     - Khi hết lượt retry hoặc lỗi API, fallback trực tiếp sang Gemini 2.5 Flash (`fallbackToGemini`).
2. **`functions/index.js`**:
   - Cập nhật fallback model trong smart scheduler (line 1890) từ `"deepseek-v4-flash"` sang `process.env.DEEPSEEK_MODEL || "deepseek-chat"`.
3. **`functions/commands/report.js`**:
   - Bổ sung bảng giá cho `deepseek-chat` vào `PRICES` (Input: $0.27 / 1M, Output: $1.10 / 1M; giữ nguyên các model cũ để bảo toàn tính toán lịch sử).
   - Cập nhật hiển thị agent trong `/health` thành `DeepSeek-Chat & Gemini`.
4. **`functions/commands/info.js`**:
   - Cập nhật thông tin Engine hiển thị trong `/info` (`DeepSeek-Chat kết hợp RAG Memory & Web Search`).
5. **Cập nhật tài liệu**:
   - `docs/features.md`: Ghi nhận mục chuyển đổi model sang `deepseek-chat` và tạm disable `deepseek-v4-pro` để tối ưu chi phí.
   - `docs/specs.md`: Đồng bộ mô tả model sang `deepseek-chat`.

## 3. Quy tắc tuân thủ
- Không tự deploy.
- Chỉ sửa code & tài liệu.
- Kiểm tra tính tương thích và syntax code sau khi chỉnh sửa.
