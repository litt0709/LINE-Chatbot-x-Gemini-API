# Kế hoạch Khắc phục: Xưng hô Lịch sự Toàn văn (Cấm gọi trống không) & Fix Profile `anh Du` (2026-11-22)

## 1. Điều tra & Nguyên nhân Gốc rễ (Root Cause Analysis)
Sau khi kiểm tra trực tiếp RTDB `chats/-1003832428084/messages` (lúc `2026-11-22T09:45:02Z`) và Firestore `user_profiles` trên cả `line-ai-chatbot-eab18` và `tele-ai-chatbot`:

1. **Tại sao `Badpaybad` không được gọi là `anh Du`:**
   - Group Telegram DLC (`-1003832428084`) đọc/ghi dữ liệu trên Firestore của project `line-ai-chatbot-eab18`.
   - Trong `tele-ai-chatbot`, `user_profiles/730806080` có `real_name: "Du"`.
   - Tuy nhiên trong `line-ai-chatbot-eab18`, `user_profiles/730806080` lại bị lưu sai thành `real_name: "Badpaybad"`! Vì vậy mọi tin nhắn của anh Du đều mang nhãn `[Badpaybad]` và `buildGroupProfileContext` bơm `[Badpaybad: Giới tính: Nam]` thay vì `[Du (nick: Badpaybad): Giới tính: Nam]`.
2. **Tại sao bot mở đầu `"Anh Lâm ơi..."` nhưng trong đoạn tóm tắt lại gọi trống không `"Lâm đang chơi lại game..."`:**
   - Lịch sử tin nhắn bơm vào LLM có nhãn `[Lâm]: ...` (không kèm `anh/chị`).
   - Khi viết tóm tắt với chỉ thị `"Khách quan"`, LLM chuyển sang ngôi thứ 3 trung tính và chép nguyên nhãn `"Lâm"` mà bỏ mất danh xưng `"anh/chị"`, do Rule `0` và guardrail tóm tắt chưa có lệnh cấm gọi tên trống không trong toàn bộ văn bản.

---

## 2. Giải pháp Triệt để ($0 Compute Cost)
1. **Sửa Ground Truth trên Firestore (`line-ai-chatbot-eab18`):**
   - Cập nhật `user_profiles/730806080`: `real_name: "Du"` (đồng bộ chuẩn với `tele-ai-chatbot`).
2. **Nâng cấp Rule `0` trong [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L234):**
   - Bắt buộc luôn kèm danh xưng `anh/chị` trước tên mọi người trong **toàn bộ câu trả lời** (kể cả khi tóm tắt hoặc tường thuật ngôi thứ 3); **TUYỆT ĐỐI KHÔNG gọi tên trống không**.
3. **Bổ sung nhắc danh xưng trong guardrail tóm tắt ([deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L569-L571)):**
   - Khi tóm tắt khách quan vẫn luôn kèm danh xưng `anh/chị` trước tên thành viên (vd: `anh Lâm`, `anh Du`, `anh Châu`).
