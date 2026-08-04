# Phase 7: Kiến trúc Kognitive Tự thân tiến hoá (Self-Evolving Cognitive Architecture)

**Mục tiêu**: Đưa bot từ mức "phản xạ có điều kiện" lên mức "nhận thức, thấu cảm và tự tiến hoá" theo chuẩn State-of-the-Art (SOTA) 2026 của LLM Agents, mà không cần dev phải can thiệp sửa đổi mã nguồn (Code-free Evolution).  
**Triết lý cốt lõi**: Tối thiểu hoá chi phí (Cost Minimization), Tối ưu Prompt (General Prompt), và tuân thủ tuyệt đối các nguyên tắc DRY, KISS, YAGNI trong `agents.md`.

---

## 1. Trí nhớ Đa tầng & Quản lý Tự phản tư (Reflective Memory Management - RMM)

**Vấn đề hiện tại**: Việc nhồi nhét toàn bộ `Core_Memory` thành một đoạn text dài khiến Context Window bị phình to (tốn token, tăng độ trễ) và giảm độ chính xác khi bot phải trích xuất dữ liệu phức tạp.
**Chuẩn SOTA 2026**: Dịch chuyển sang Hierarchical Memory (Trí nhớ phân cấp).

**Đề xuất giải pháp**:
- **Tái cấu trúc Firestore**: Chia nhỏ `Core_Memory` thành các Node dạng JSON có cấu trúc thay vì chuỗi Text tự do:
  - `User_Preferences`: (Sở thích, thói quen xưng hô).
  - `Psychological_Profile`: (Đặc điểm tâm lý, tính cách).
  - `Relational_Facts`: (Các sự kiện liên quan đến người dùng).
- **Tự động nén & Đúc kết (Semantic Compression)**: Cải tiến tiến trình `evolution.js` (chạy ngầm lúc 3h sáng). Bot sẽ thực hiện **Retrospective Reflection** (tự nhìn lại lịch sử chat), gỡ bỏ những dữ liệu lỗi thời, gom cụm (cluster) những sở thích trùng lặp, và *ghi đè* vào JSON cấu trúc thay vì cứ nối dài text. Bot trở nên sắc sảo hơn mỗi ngày mà lượng token truyền vào prompt luôn được nén ở mức tối thiểu.

## 2. Meta-Cognition & Cập nhật System Prompt Động (Dynamic Prompt Evolution)

**Vấn đề hiện tại**: System Prompt (tính cách, luật lệ) bị hard-code trong logic hệ thống. Muốn bot "khôn" hơn ở một kỹ năng mới, lập trình viên phải sửa code.
**Chuẩn SOTA 2026**: Meta-Agents (Hệ thống có khả năng tự thay đổi bộ quy tắc của chính mình thông qua feedback).

**Đề xuất giải pháp**:
- **Cơ chế "Tầm sư học đạo" thời gian thực**: Lưu một mảng `Dynamic_Rules` riêng biệt cho mỗi User/Group trong Firestore.
- **Tự động trích xuất Luật**: Khi người dùng trực tiếp sửa lưng bot (VD: *"Từ nay gọi anh là Sếp"*, *"Lần sau báo giá thì đừng ghi dài dòng"*), bộ lọc Intent sẽ nhận diện đây là lệnh `UPDATE_RULES` và tự động push vào `Dynamic_Rules`.
- **Nội suy Prompt siêu nhẹ**: Khi gọi LLM (`deepseek.js`), chỉ cần map mảng `Dynamic_Rules` này vào System Prompt. Bot sẽ tự thay đổi hành vi vĩnh viễn theo ý người dùng mà không cần sửa 1 dòng code nào.
- **Tối ưu Token**: Định kỳ, `evolution.js` sẽ review lại mảng `Dynamic_Rules` này, loại bỏ các luật mâu thuẫn nhau để giữ cho General Prompt luôn ngắn gọn nhất (tuân thủ Token Optimize).

## 3. Lý luận Đa tiến trình (Dual-Process Theory: System 1 vs System 2)

**Vấn đề hiện tại**: Mọi luồng chat đều dùng chung một cấu hình LLM, dẫn đến lãng phí resource cho các câu hỏi đơn giản, nhưng lại thiếu chiều sâu cho các tác vụ phức tạp.
**Chuẩn SOTA 2026**: Decoupling (Phân tách) luồng tư duy nhanh (System 1) và tư duy sâu (System 2).

**Đề xuất giải pháp**:
- **System 1 (Fast Routing)**: Xử lý 90% hội thoại thông thường (chào hỏi, phiếm luận, hỏi đáp ngắn). Dùng `deepseek-chat` / `gemini-2.5-flash` với prompt cực ngắn gọn để đạt tốc độ phản hồi tức thì và chi phí tiệm cận 0.
- **System 2 (Deep Reasoning)**: Khi phát hiện câu hỏi mang tính lập kế hoạch, hỏi phân tích chuyên sâu, hoặc user đang gặp vấn đề tâm lý phức tạp, hệ thống tự động switch sang model có khả năng Chain-of-Thought (như `deepseek-reasoner` / `R1`).
- **Thực thi**: Xây dựng một Classifier rất nhẹ ở Gateway (hoặc Regex pattern) để quyết định sẽ định tuyến câu hỏi vào System 1 hay System 2.

## 4. Phân tích Mạch ngầm Cảm xúc & EQ (Empathy Sub-text Analysis)

**Vấn đề hiện tại**: Bot chưa nắm bắt tốt các Sticker, Emoji mang hàm ý ẩn (như thở dài, khóc) hoặc các trạng thái cảm xúc tiêu cực, dẫn đến trả lời máy móc.

**Đề xuất giải pháp**:
- **Định danh Trạng thái Cảm xúc (Emotional State Caching)**: Gắn thêm metadata `current_emotion` vào User Profile tạm thời.
- **Bắt mạch cảm xúc qua Emoji/Sticker**: Map các bộ Sticker/Emoji thông dụng (như mếu, cạn lời, chửi thề) thành các chỉ báo tâm lý.
- **Thích ứng Giọng điệu (Tone Adaptation)**: Nếu `current_emotion = negative/vulnerable`, System Prompt tự động được inject thêm một chỉ thị ưu tiên: *"Khách hàng đang nhạy cảm. Hãy hạ tone giọng, ân cần, thiên về lắng nghe và đồng cảm, tuyệt đối không đùa cợt"*. Việc này giúp bot có "EQ cao" và thấu hiểu con người sâu sắc hơn.

---

## Tóm tắt Lộ trình Triển khai (Actionable Roadmap)

- [ ] **Step 1: Cấu trúc lại LTM (Long Term Memory)**
  - Chuyển đổi `Core_Memory` từ dạng chuỗi văn bản thuần sang cấu trúc JSON (`User_Preferences`, `Psychological_Profile`).
- [ ] **Step 2: Nâng cấp luồng "Tầm sư học đạo"**
  - Tối ưu hóa `evolution.js` để chạy thuật toán "Tự phản chiếu" (Retrospective Reflection) nén dữ liệu cũ.
- [ ] **Step 3: Triển khai Dynamic Rules**
  - Thêm chức năng nhận diện cờ `UPDATE_RULES` từ tin nhắn người dùng để bot tự cập nhật `System Prompt` của chính nó.
- [ ] **Step 4: Nâng cấp EQ & Dual-Process**
  - Bổ sung bộ phân tích Sticker/Emoji thành các trạng thái tâm lý (`current_emotion`).
  - Xây dựng Router phân luồng câu hỏi khó/dễ để chọn Model tương ứng (Tiết kiệm chi phí).
