# Kế hoạch Nâng cấp "Smart Chatbot" (Phiên bản ZERO COST)

Tuân thủ nguyên tắc **Tối thiểu hóa chi phí (Cost Minimization)** trong `AGENTS.md`, em đã điều chỉnh lại bản thiết kế để đạt được tiêu chí **Zero Cost (Gần như 0 đồng)**. Thay vì dùng các dịch vụ bên thứ 3 (như Vector DB) hay gọi API dư thừa, chúng ta sẽ tận dụng tối đa sức mạnh của DeepSeek (giá cực rẻ) và Free-tier của Firebase.

---

## 1. Dynamic Regex Engine (Thay vì Vector DB tốn phí)
**Mục tiêu:** Không cần sửa file code mỗi lần update từ khóa.
- **Giải pháp Zero Cost:** Đưa toàn bộ các mảng `NEWS`, `FINANCE`, `STANDALONE_TOPICS`, `PROACTIVE_TRIGGER_WORDS`... lên một Document duy nhất tên là `bot_config` trên Firestore (Firebase).
- Kích hoạt tính năng **Node-Cache** (Lưu trong RAM của Cloud Function). Bot chỉ đọc Firebase đúng 1 lần khi khởi động (Cold Start), sau đó dùng cache. Việc này giúp tiết kiệm hoàn toàn hạn mức 50,000 lượt đọc/ngày miễn phí của Firebase.
- Khi người dùng hỏi những câu mới, thay vì tốn tiền chạy Vector Search, LLM tự trích xuất keyword và đẩy lệnh cập nhật thẳng vào Document `bot_config`. Cấu hình tự động reload sau mỗi 5 phút.

## 2. Trí nhớ Cuốn chiếu (Rolling Summary Memory thay vì RAG)
**Mục tiêu:** Bot nhớ dai như đỉa, context window luôn ngắn, không tốn tiền thuê Vector DB.
- **Giải pháp Zero Cost:** Thay vì lưu hàng nghìn dòng chat vào DB, mỗi khi một phiên chat kéo dài hoặc sang ngày mới, bot sẽ chạy ngầm một luồng Tóm tắt (Rolling Summary).
- Nó sẽ tự tóm lược: *"User A thích ăn bún bò, đi ngủ lúc 11h, hôm qua vừa bị sếp mắng"*.
- Đoạn tóm tắt này (chỉ khoảng 3-4 câu) sẽ được đè vào trường `Core_Memory` của User trên Firestore. Ở các lần chat sau, Prompt chỉ cần bơm đúng 4 câu này vào là bot nhớ lại tất cả. Giảm 80% số lượng token đầu vào (Input Tokens).

## 3. Hành động Đa bước "Tiết kiệm" (Budget-Constrained ReAct)
**Mục tiêu:** Bot biết tự suy nghĩ nhiều bước nhưng không đốt tiền API.
- **Giải pháp Zero Cost:** Áp dụng mô hình "Single-Turn Tool Call" kết hợp với DeepSeek Flash (giá chỉ ~0.03$/1M Tokens - rẻ như cho). 
- Nghĩa là bot được phép tự gọi Google Search. Tuy nhiên, thay vì lặp lại vô tận (ReAct Loop) gây tốn kém, ta sẽ giới hạn cứng (Hard Limit): **Tối đa 2 lần gọi Search mỗi tin nhắn**. Nếu lần 2 vẫn không ra kết quả, buộc phải trả lời *"Em tìm không thấy"*. 
- Việc này giúp câu trả lời sâu sắc hơn mà chi phí API tăng thêm không đáng kể (chỉ thêm ~0.0001$ mỗi câu).

## 4. Tự động Phản tỉnh (Self-Reflection Rules)
**Mục tiêu:** Chỉnh sửa tính cách bot cá nhân hóa, 0 đồng.
- **Giải pháp Zero Cost:** Dạy bot tự đẻ ra các thẻ `<RULE action="..." />`. 
- Khi user chỉnh đốn bot, bot ghi thẻ này thẳng vào Firebase của user đó. Lần sau, luật này đính kèm vào System Prompt. Kỹ thuật này tốn 0 đồng tiền DB, chỉ tiêu tốn thêm khoảng 20 token mỗi lượt chat, hoàn toàn nằm trong mức độ tối ưu token.

---

### Kết luận Về Chi Phí
- **Hạ tầng (Firestore/Functions):** **$0/tháng** (Nằm hoàn toàn trong Free Tier của Google do áp dụng Node-Cache và giảm số lượt Read/Write).
- **Vector Database (Pinecone/Qdrant):** **$0/tháng** (Loại bỏ hoàn toàn, dùng Dynamic Regex Engine).
- **API Token (DeepSeek):** Có thể tăng nhẹ do cơ chế Tóm tắt Cuốn chiếu, nhưng nhờ rút ngắn Context Window (nhờ bỏ bớt lịch sử chat dài), tổng lượng Token tiêu thụ có thể **GIẢM** so với hiện tại.

### Lộ trình Đề xuất Triển khai (Phase 1):
1. **Dynamic Config:** Tạo `bot_config` trên Firebase, chuyển toàn bộ Regex trong code lên đây.
2. **Caching:** Viết cơ chế reload cấu hình (5 phút/lần) trong `index.js`.
3. **No-Code Update:** Viết lại lệnh `/update` để bot đọc `audit_logs` và update thẳng vào `bot_config` (không cần lập trình viên sửa code).
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
