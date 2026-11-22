# Kế hoạch Khắc phục 3 Sự cố: Rò rỉ DSML, Typing Ảo Telegram, và Nhầm Thứ Trong Tuần (2026-10-07)

## 1. Vấn đề & Phân tích Nguyên nhân Gốc rễ (Root Cause Analysis)

### Issue 1: Rò rỉ mã thẻ DSML Tool Calls (`<｜｜DSML｜｜ calls>...`)
- **Hiện tượng:** Bot trả về nguyên văn khối mã nội bộ của DeepSeek:
  ```xml
  <｜｜DSML｜｜ calls>
  <｜｜DSML｜｜ invoke name="google_search">
  <｜｜DSML｜｜ parameter name="query" string="true">"800亿" "8亿" 程序员 团队 被裁 成本 传闻 真假</｜｜DSML｜｜ parameter>
  </｜｜DSML｜｜ invoke>
  ...
  </｜｜DSML｜｜ calls>
  ```
- **Nguyên nhân gốc rễ:**
  - Mô hình DeepSeek thỉnh thoảng sinh function call dạng văn bản DSML thô trong `content` thay vì trả qua JSON `tool_calls` của API.
  - Mã hiện tại trong `functions/utils/deepseek.js` (dòng 523) chỉ bắt một trường hợp duy nhất: `contentStr.includes("<｜｜DSML｜｜tool_calls>")` và dùng regex cứng nhắc không có khoảng trắng (`<｜｜DSML｜｜invoke...`).
  - Khi DeepSeek biến đổi thành `<｜｜DSML｜｜ calls>` (có khoảng trắng, dùng chữ `calls` thay vì `tool_calls`, tham số có `string="true"`, thẻ đóng có khoảng trắng `</｜｜DSML｜｜ parameter>`), điều kiện `includes` bị `false`.
  - Kết quả: Hệ thống không bóc tách được tool call, không kích hoạt tìm kiếm, và trả nguyên khối văn bản DSML rác về cho người dùng.
- **Giải pháp:**
  1. Nâng cấp bộ bắt DSML tổng quát: Bắt mọi biến thể khoảng trắng và tên thẻ (`calls` hoặc `tool_calls`, `invoke`, `parameter` kèm thuộc tính).
  2. Bóc tách query và chuyển vào `responseMessage.tool_calls` để vòng lặp tiếp tục thực thi `google_search` bình thường.
  3. Thêm bộ lọc triệt để trước khi trả về: Nếu câu trả lời cuối cùng vẫn còn chứa bất kỳ thẻ `<｜｜DSML｜｜`, lập tức loại bỏ mã DSML; nếu rỗng hoặc toàn DSML thì tự động gọi lại LLM (hoặc fallback) để lấy câu trả lời thật sự bằng tiếng Việt.

---

### Issue 2: Annie hiển thị "typing" ngẫu nhiên trên Telegram rồi không comment
- **Hiện tượng:** Trong nhóm Telegram, người dùng thấy bot báo trạng thái "Annie is typing..." trong vài giây nhưng sau đó không có tin nhắn nào xuất hiện.
- **Nguyên nhân gốc rễ:**
  - Trong Telegram webhook (`functions/index.js` dòng 1213), lệnh `telegram.sendChatAction(chatId, "typing")` được gọi ngay từ đầu cho **mọi** tin nhắn lọt vào luồng xử lý (bao gồm cả khi kích hoạt **Proactive Intervention - Nghe lén** hoặc **Focus Mode**).
  - Sau đó, LLM chạy phân tích ngữ cảnh. Với tin nhắn nghe lén hoặc user nói chuyện với nhau, System Prompt chỉ thị: *"Nếu chỉ là tán gẫu, BẮT BUỘC xuất ra chữ IGNORE"*.
  - Khi DeepSeek trả về `IGNORE`, dòng 1278 kết thúc request (`return res.end()`) mà không gửi tin nhắn.
  - Tuy nhiên, Telegram đã kịp phát tín hiệu "typing" cho các thành viên trong nhóm thấy. Sau vài giây timeout của Telegram, trạng thái typing tự mất mà không có tin nhắn nào được gửi.
- **Giải pháp:**
  - **Chỉ gửi `sendChatAction(chatId, "typing")` sớm** khi: Chat 1-1 riêng tư (`chatType === "private"`) hoặc người dùng trực tiếp gọi bot (`isDirectlyTargeted`).
  - Với các trường hợp nghe lén (`isProactiveTargeted`) hoặc `forceIgnoreCheck` trong nhóm: **Tuyệt đối không gửi typing trước**. Chỉ gửi tin nhắn sau khi LLM xác nhận câu trả lời không phải là `IGNORE`.

---

### Issue 3: Annie chúc "cuối tuần vui vẻ" vào Thứ Tư
- **Hiện tượng:** Thứ Tư (07/10/2026), các thành viên trò chuyện về việc "hết giờ rồi, nghỉ thôi", Annie vào chúc *"Chúc anh Lâm và mọi người cuối tuần vui vẻ, nghỉ ngơi thật tốt nha! ✨"*.
- **Nguyên nhân gốc rễ:**
  - Trong `buildSystemPrompt` (`functions/utils/deepseek.js`), biến thời gian chỉ được format dưới dạng: `Now=${hours}:${minutes} ${date}/${month}/${year}` (ví dụ: `19:50 07/10/2026`), **hoàn toàn không có thứ trong tuần** (`Thứ Tư`).
  - LLM không tự tính nhẩm chính xác thứ trong tuần đối với một ngày cụ thể (đặc biệt trong tương lai 2026).
  - Khi thấy người dùng nói "hết giờ, nghỉ thôi" vào buổi tối, LLM suy diễn sai rằng đã đến cuối tuần và chúc cuối tuần.
- **Giải pháp:**
  - Bổ sung thứ trong tuần (`dayName`: Thứ Hai, Thứ Ba, Thứ Tư, Thứ Năm, Thứ Sáu, Thứ Bảy, Chủ Nhật) vào biến `now` trong `buildSystemPrompt`.
  - Bổ sung chỉ thị ngắn gọn vào Rule 1:
    > *"1. Thời gian: Now=${now}. Hôm nay là ${dayName}. TUYỆT ĐỐI KHÔNG chúc cuối tuần khi chưa phải Thứ Bảy hoặc Chủ Nhật."*

---

## 2. Các file mã nguồn cần điều chỉnh
1. **`functions/utils/deepseek.js`**:
   - Nâng cấp regex bóc tách DSML tổng quát và bộ lọc an toàn chống rò rỉ DSML.
   - Bổ sung `dayName` vào `now` và rule cấm chúc cuối tuần giữa tuần trong `buildSystemPrompt`.
2. **`functions/index.js`**:
   - Điều kiện hóa lệnh `telegram.sendChatAction(chatId, "typing")`: Chỉ gửi khi `chatType === "private"` hoặc `isDirectlyTargeted`.
3. **`docs/features.md`**:
   - Cập nhật mục tính năng về cơ chế chống rò rỉ DSML và triệt tiêu ghost typing Telegram.
