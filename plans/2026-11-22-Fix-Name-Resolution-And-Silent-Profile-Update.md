# Kế hoạch Khắc phục: Nhận diện Đúng Tên Người (Dầu ≠ Duy) & Cập nhật Hồ sơ Ngầm (2026-11-22)

## 1. Điều tra & Nguyên nhân Gốc rễ (Root Cause Analysis)

Sau khi kiểm tra Firestore (`user_profiles`, `users/C60ea74c002d5ba0d8f082086462d3fd0` — nhóm Bóng bàn), RTDB (`metadata/line_participants`) và mã nguồn [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js):

### Issue 1: Nhận nhầm tên Dầu (`Dinh Manh Dau` / `Dau Dinh`) thành `Duy` (`Duy Mac Van`)
1. **Thiếu thu thập `participants` khi nghe ngầm (Passive Listening):**
   - Trong [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L1528-L1545) (LINE) và [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L1154-L1167) (Telegram), khi thành viên chat trong nhóm mà không tag bot, hệ thống lưu tin nhắn rồi `continue/return` mà **không lưu `userId` & `senderName` vào `line_participants` / `tg_participants`**.
   - Hệ quả: `metadata/line_participants` có `duy mac van` (`U016d7cf9cc1f87925e082dccfda2dc98`) nhưng **hoàn toàn vắng mặt `dau dinh`** (và `daint`), dù cả hai hoạt động thường xuyên trong nhóm Bóng bàn.
2. **`buildGroupProfileContext` vứt bỏ user chưa có `user_profiles` & không so khớp bỏ dấu (`removeAccents`):**
   - Tại dòng 256: `if (!profile) return null;` khiến bất kỳ thành viên nào chưa có doc trong Firestore `user_profiles` (như anh `Dau Dinh`) bị **loại hoàn toàn** khỏi khối `Thông tin tập thể`, trong khi `Duy Mac Van` có sẵn profile nên luôn nổi bật trong context.
   - Khi user nhắn `"anh Dầu"` (có dấu), `paddedPrompt.includes(" dau ")` không khớp với `"dau dinh"` (không dấu) do chưa so khớp `removeAccents`.
3. **`resolveCanonicalUserId` fallback nguy hiểm về `senderId`:**
   - Khi bot tạo tag `<PROFILE userId="Dau Dinh" ... />` nhưng `dau dinh` không có trong `participants`, hàm rơi xuống `return String(senderId)` (dòng 368), có nguy cơ ghi đè nhầm profile của người gửi hiện tại.
4. **Hiển thị `real_name` vs `nick` chưa tách bạch:**
   - Khi user đã có `real_name`, context chưa hiển thị kèm `(nick: ...)` để LLM ánh xạ chính xác giữa nick LINE/Telegram trong lịch sử chat với tên thật thân thiện.

### Issue 2: Thông báo `[Hệ thống: Đã cập nhật hồ sơ cá nhân]` thừa & bị lặp 2 lần
- Tại [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L451), mỗi thẻ `<PROFILE ... />` trong vòng `while` đều bị thay thế bằng `\n[Hệ thống: Đã cập nhật hồ sơ cá nhân]`.
- Khi LLM xuất 2 thẻ `<PROFILE>` trong 1 lượt phản hồi, tin nhắn hiển thị 2 dòng thông báo thừa thãi.

---

## 2. Giải pháp Thông minh ($0 Compute Cost)

1. **Thu thập `participants` tự động ngay cả khi Passive Listening (LINE & Telegram):**
   - Bổ sung helper `syncPassiveParticipant(platform, userId, senderName, extraAlias)` cập nhật RAM cache + fire-and-forget `saveGlobalParticipants(...)` không tốn thêm API call.
2. **Nâng cấp `buildGroupProfileContext` ([index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L216-L292)):**
   - So khớp mention theo cả **có dấu** và **không dấu** (`removeAccents`) để `"Dầu"` luôn khớp `"Dau Dinh"`.
   - **Không bỏ qua** `isSender` / `isMentioned` dù chưa có `user_profiles` trên Firestore (vẫn cung cấp Ground Truth tối thiểu `[Tên hiển thị]`).
   - Khi có `real_name` khác với nick, định dạng rõ `[Tên thật (nick: Nick) | ...]` giúp LLM luôn ưu tiên gọi tên thật và không bao giờ nhầm lẫn giữa 2 người có tên gần giống nhau.
3. **Chặn ghi đè nhầm trong `resolveCanonicalUserId` ([index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L303-L373)):**
   - Chỉ fallback về `senderId` khi `userIdAttr` rỗng. Nếu `userIdAttr` chỉ định người khác mà không tìm thấy → `return null`.
   - Loại bỏ bước `includes` lỏng lẻo trên chuỗi ngắn dễ match nhầm tên na ná.
4. **Cập nhật Rule `0` trong `buildSystemPrompt` ([deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L234)):**
   - Nhấn mạnh nguyên tắc tổng quát: **Luôn ưu tiên gọi tên thật thân thiện, chỉ dùng nick khi chưa có tên thật; phân biệt rạch ròi từng cá nhân, CẤM đoán hay gộp nhầm tên gần giống nhau**.
5. **Cập nhật hồ sơ ngầm 100% ([index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L451)):**
   - Thay `\n[Hệ thống: Đã cập nhật hồ sơ cá nhân]` bằng `""`, xóa hoàn toàn thông báo thừa và lỗi lặp 2 lần.
