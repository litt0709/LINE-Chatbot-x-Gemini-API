# Kế hoạch Nâng cấp: Smart Conversational Focus Mode (3 Lớp Nhận diện Mạch Hội thoại & Chống Làm phiền) — 2026-11-24

## 1. Nguyên nhân Khiến Focus Mode Cũ Bị "Mất Cảm Giác"
Qua kiểm tra mã nguồn [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L112) và [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L663):
1. **`QUESTION_OR_COMMAND_REGEX` quá hẹp:** Chỉ bắt câu có dấu `?` hoặc vài từ để hỏi đầu/cuối câu (`tại sao`, `nhỉ`, `nhé`, `đi`). Trong thực tế chat tiếng Việt trên điện thoại, người dùng thường phản hồi tự nhiên không dấu `?` như *"viết ngắn lại xem"*, *"đoạn 2 chưa chuẩn vần"*, *"còn trường hợp X"*, *"em kiểm tra lại giúp anh"* → bị rớt 100%.
2. **Chỉ lưu trong RAM (`focusModeCache = new Map()`) với TTL ngắn (3 phút):** Trên Cloud Functions Gen 2 đa instance, nếu tin tiếp theo rơi sang instance khác hoặc user đọc câu trả lời lâu hơn 3 phút, trạng thái Focus bị mất trắng.
3. **Thiếu nhận diện chuyển người nghe (Turn-Taking / Peer Switch) & câu lệnh `forceIgnoreCheck` chưa hiểu Focus Mode:** Chưa tự ngắt Focus khi người khác xen vào đối đáp ngang hàng (`tớ/cậu/ông/ae`) hoặc khi user reply tin nhắn người khác; và prompt `forceIgnoreCheck` mới chỉ xét trường hợp "nhắc tên bot ngôi thứ 3" chứ chưa xét tính liên tục chủ đề của Focus Mode.

---

## 2. Kiến trúc Giải pháp 3 Lớp (Smart Conversational Focus Engine — $0 Extra Infra Cost)

### Lớp 1: Đồng bộ Trạng thái Focus Đa Instance (L1 RAM + L2 RTDB, Sliding Window 5 phút)
- Lưu `{ userId, expiresAt, peerSpokeSinceBot, lastBotMsgId }` tại cả RAM `focusModeCache` và RTDB `chats/${chatId}/metadata/focusState` ($0 write).
- Mỗi khi bot phản hồi user, cửa sổ Focus tự trượt thêm **5 phút** (`peerSpokeSinceBot = false`).
- Nếu có **thành viên khác** nhắn vào nhóm (không gọi bot), đánh dấu `peerSpokeSinceBot = true`.
- Nếu user đang Focus bấm **Reply vào tin nhắn của thành viên khác** hoặc tag `@người_khác` → **Xóa Focus ngay lập tức** (`clearFocusState`).

### Lớp 2: Bộ Lọc Ngôn ngữ & Luân phiên Lượt nói Offline (`evaluateFocusFollowUp` — <0.5ms, $0)
Khi user đang trong cửa sổ Focus nhắn tin mà không tag bot:
1. **Ngắt Focus tức thì ($0 LLM cost)** nếu phát hiện đại từ giao tiếp ngang hàng với bạn bè hoặc nhắc bot ở ngôi thứ 3: `tớ`, `cậu`, `mày`, `tao`, `ông ơi`, `bà ơi`, `các bác`, `ae ơi`, `con bot`, `bảo nó`, `nó làm`.
2. **Bỏ qua từ cảm thán ngắn <= 3 ký tự** (`ok`, `ừ`, `=))`) để không spam.
3. **Kích hoạt Focus (`isImplicitlyTargeted = true`)** khi:
   - Câu có gọi trực tiếp `"em"` (vd *"em sửa lại câu cuối"*, *"ý em là sao"*) — kể cả khi đã có người khác nói xen vào.
   - Hoặc **chưa có ai khác xen vào** (`!peerSpokeSinceBot` — mạch 1-1 liên tục với bot) và câu có nội dung thực chất (`>= 6` ký tự hoặc khớp bộ từ khóa nối tiếp mở rộng `FOLLOWUP_INTENT_REGEX`).

### Lớp 3: Cổng Kiểm định Ngữ cảnh & Đổi Chủ đề bằng LLM (`forceIgnoreCheck` nâng cấp trong `deepseek.js`)
- Nâng cấp chỉ thị kiểm tra người nhận trong [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L663):
  - Đối chiếu trực tiếp tin `[NEW]` với câu trả lời vừa xong của bot:
    - Nếu user đang hỏi nối tiếp, góp ý sửa lại, phản biện hoặc nói với `"em"` → **Trả lời tự nhiên & gia hạn Focus**.
    - Nếu user đã **đổi hẳn sang chủ đề tán gẫu khác** để nói với cả nhóm hoặc nói với người khác → xuất `IGNORE`.
- **Tự nhả Focus khi `IGNORE`:** Ngay khi LLM trả về `IGNORE` trong Focus Mode, `index.js` gọi `clearFocusState(chatId)` để ngắt Focus hoàn toàn — các câu tán gẫu tiếp theo của user với bạn bè sẽ **không tốn thêm bất kỳ lượt gọi LLM nào nữa**!
