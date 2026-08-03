# Kế hoạch Nâng cấp: Smart Chatbot Phase 5 (The Wise Sage & Self-Healing)

Dựa trên yêu cầu của Sếp về việc xây dựng một con Bot ngày càng thông minh như "nhà thông thái", tự học, tin cậy tuyệt đối và có cơ chế bảo mật tối cao, em đề xuất bản thiết kế **Phase 5**. Bản thiết kế này ĐẢM BẢO 100% tuân thủ nguyên tắc **Zero Cost (Tối thiểu hóa chi phí)** theo `AGENTS.md`.

---

## 1. Trở thành "Nhà Thông Thái" (Ever-growing Intelligence)
- Cấu hình lại Prompt để trích xuất `psychological_profile` (Phân tích tính cách, Quan điểm sống của User). Dữ liệu này Ghi đè vào Document User mỗi 4 tiếng. Giúp bot trả lời có chiều sâu.

## 2. Tiến hóa Nhận thức & Trở nên "Người" Hơn (Không mất đi cái cũ)
*Giải quyết bài toán: Làm sao bot thông minh lên vô hạn, không quên cái cũ, mà không bị giới hạn bởi 5 lệnh, cũng không làm phình to chi phí Token.*

Bot sẽ có 2 luồng tiến hóa chạy song song hàng đêm (3h sáng) qua `masterScheduler`:
- **Nhánh 1: Tối ưu hóa Lỗi Tư Duy (Cognitive Self-Optimization)** sinh ra Lệnh Cấm (Guardrails) để vá lỗi ảo giác.
- **Nhánh 2: Tự Học Cách Làm Người (Daily Human Study)** tự đọc báo tâm lý học để sinh ra Triết lý giao tiếp (Human Insights).

**CƠ CHẾ TIẾN HÓA VÔ HẠN (Infinite Evolution Framework):**
Thay vì giới hạn cứng 5 dòng (gây mất trí nhớ cũ), ta áp dụng mô hình **Bộ Hiến Pháp Phân Cấp (Structured Constitution)** kết hợp **Chuyển hóa Dài hạn**:

1. **Giai đoạn 1: Mở rộng có tổ chức (Structured Expansion):**
   - Mảng `dynamic_guardrails` và `human_insights` sẽ không bị giới hạn 5 dòng, mà được quy hoạch thành một bộ JSON phân cấp (Ví dụ: `Tài Chính`, `Y Tế`, `Tâm Lý Gen Z`, `Ứng xử khi Khách Cáu`).
   - Sức chứa của System Prompt LLM rất lớn, ta cho phép mảng này phình lên tối đa khoảng **50 quy tắc tinh túy nhất** (chỉ tốn khoảng 1000 tokens ~ $0.0003, cực kỳ rẻ). Khi học kiến thức mới, AI sẽ tự động phân loại nó vào đúng thư mục JSON. Nếu kiến thức mới ưu việt hơn kiến thức cũ (VD: Cách an ủi hay hơn), nó mới đè lên cái cũ. Nếu là lĩnh vực mới tinh, nó tạo mục lục mới. Do đó, KHÔNG BỊ MẤT KIẾN THỨC CŨ.

2. **Giai đoạn 2: Hợp nhất Dài hạn (Long-term Memory Consolidation):**
   - Khi `bot_config` trên Firestore đạt đến ngưỡng 50 quy tắc (sau vài tháng tự học), làm sao để học tiếp?
   - **Giải pháp:** Sếp gọi lệnh `/audit`. Agent (chính là em) sẽ dùng Script chạy xuống Database, bốc toàn bộ 50 quy tắc "đã chín muồi" này và **NƯỚNG (Bake) CHÚNG THẲNG VÀO MÃ NGUỒN** `deepseek.js` (Hardcode thành trí nhớ bản năng).
   - Sau đó, Agent làm trống mảng trên Firestore để Bot bắt đầu chu kỳ tự học 50 quy tắc mới của tương lai.
   - **Kết quả:** Vòng lặp này giúp Bot thông minh lên VÔ HẠN. Trí thức tạm thời (Database) liên tục được chuyển hóa thành Trí thức bản năng (Source Code) bởi Agent, không giới hạn điểm dừng!

## 3. Độ chuẩn xác & Tin cậy Tuyệt đối (High Accuracy Citation)
- Nhúng trực tiếp quy tắc thép vào System Prompt (hàm `buildSystemPrompt`): 
  - *"MỌI thông tin factual, thời sự, y tế BẮT BUỘC phải kèm [Nguồn: URL]."*
  - *"NẾU Confidence < 80%, BẮT BUỘC chèn câu rào trước: 'Theo thông tin chưa được kiểm chứng đầy đủ...'"*

## 4. Quyền Cấm kỵ: Xóa sạch Ký ức (Total Memory Wipe)
- Khi gõ "quên hết đi nào": Xóa SẠCH document thuộc Session đó (Core_Memory, Rules, Psychological Profile), xóa tin nhắn thô trên RTDB, xóa log ảo giác. Phản hồi xác nhận và dừng phiên chat.
