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
