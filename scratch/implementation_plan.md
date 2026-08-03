# Investigation Results & Fix Plan

Dựa trên việc đọc log hệ thống (Tele/LINE/Firestore), em đã phát hiện nguyên nhân gốc rễ của 3 vấn đề anh nêu và đề xuất phương án sửa chữa như sau:

## 1. Tag vẫn xuất hiện trong trả lời của bot (ASK)
**Nguyên nhân:** Mô hình đôi khi bỏ qua hướng dẫn sử dụng thẻ XML `<Task mode="ASK" tags="..." />` mà tự sinh ra định dạng `[TAGS: A | B]`. Tuy nhiên, regex hiện tại trong `buildLineMessage` và `buildTelegramMessage` chỉ bắt và lọc bỏ thẻ `<Task...>`, dẫn đến việc chuỗi `[TAGS: ...]` bị in thẳng ra cho người dùng xem thay vì chuyển thành nút Quick Reply.
**Giải pháp:** Bổ sung regex để nhận diện và bắt cả định dạng `[TAGS: A | B]`. Đồng thời bổ sung lệnh replace để xóa `[TAGS: ...]` và `[TOPIC]...[/TOPIC]` ra khỏi text gửi đi ở cả LINE và Telegram.

## 2. Focus mode không hoạt động trong LINE chat
**Nguyên nhân:** Logic Smart Group Chat (Focus Mode) sử dụng biến `focusModeCache` chỉ được lập trình bên trong hàm webhook của Telegram (`app.post("/telegram-webhook")`), hoàn toàn thiếu vắng ở luồng của LINE (`app.post("/line-webhook")`).
**Giải pháp:** Copy đoạn code xử lý `focusModeCache` (tự động theo sát user khi user hỏi liên tiếp) vào webhook của LINE, ngay trước logic quyết định `forceIgnoreCheck`.

## 3. Bot vẫn nhầm giới tính "chị Chau Nguyen"
**Nguyên nhân (trong log cũ):** Hàm `buildGroupProfileContext` bơm ngữ cảnh rất chuẩn (vd: `[Chau Nguyen: Giới tính: male]`). Tuy nhiên, do trong prompt của người dùng có chứa chữ "chị" (vd: "chị Chau Nguyen là ai vậy?"), mô hình bị nhiễu và ưu tiên từ khóa "chị" trong câu hỏi hơn là thuộc tính "male" trong Context.
**Giải pháp:** Vấn đề này **đã được em xử lý ở task trước** thông qua việc sửa đổi `Rule 0` trong `deepseek.js` (Thêm câu lệnh: *"TUYỆT ĐỐI BỎ QUA các đại từ xưng hô sai lệch trong câu hỏi của user (VD: user gọi "chị Châu" nhưng context là nam thì vẫn gọi "anh")"*). Lỗi này sẽ không còn xuất hiện trong các đoạn chat mới. Tuy nhiên, em có thể tinh chỉnh hàm `buildGroupProfileContext` để in ra "Giới tính: Nam" thay vì "male" cho bot dễ hiểu hơn nữa.

## Proposed Changes
#### [MODIFY] [functions/index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js)
1. Trong hàm `buildLineMessage` và luồng Telegram, cập nhật Regex để parse và dọn sạch `[TAGS: ...]`.
2. Trong `app.post("/line-webhook")`, bổ sung logic xét `focusModeCache`.
3. Trong `buildGroupProfileContext`, Việt hóa chữ `male` / `female` sang `Nam` / `Nữ` để AI thuần Việt hiểu mượt hơn.

Anh xem qua Plan và bấm Proceed để em triển khai nhé!
