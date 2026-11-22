# Kế hoạch Khắc phục Triệt để: Chuẩn hóa Nhãn Người Nói Đồng bộ từ `user_profiles` (Canonical Speaker Label Resolution) — 2026-11-22

## 1. Nguyên nhân Gốc rễ (Root Cause từ Logs RTDB `-1003832428084`)
Đối chiếu các tin nhắn lúc `10:04:05Z` và `10:04:24Z` ngày `2026-11-22`:
1. **Tại sao bot lúc gọi `anh Du`, lúc gọi `anh Badpaybad`:**
   - Các tin nhắn cũ lưu trong RTDB trước thời điểm sửa `user_profiles/730806080` vẫn mang chuỗi tĩnh `senderName: "Badpaybad"` (nhưng có `senderId: "730806080"`).
   - Tại [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L498-L505), vòng lặp dựng `history` đẩy nguyên `[${msg.senderName}]: ${msg.text}` vào LLM **mà không tra ngược `msg.senderId` sang `real_name` mới nhất từ `user_profiles`**.
   - Hệ quả: Trong cùng một cửa sổ hội thoại, LLM thấy lẫn lộn cả `[Badpaybad]: ...` lẫn `[Du]: ...` nên tưởng là 2 người khác nhau.
2. **Tại sao bot mở đầu `"Anh Du ơi..."` nhưng câu sau lại viết trống không `"Lâm đang tính..."`:**
   - Toàn bộ 25 tin nhắn trong `history` và tin nhắn hiện tại `[NEW] [Lâm]: ...` đều dùng nhãn tên trống không (thiếu danh xưng `anh/chị`), khiến LLM tự nhiên bắt chước nhãn đầu vào khi chuyển ngôi nói.

## 2. Giải pháp Triệt để — Ground Truth Data Feeding (0% Hardcode, $0 Extra LLM Cost)
Trong [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js):
1. **Thêm RAM Cache 5 phút cho `user_profiles` (`speakerProfileCache`) & hàm `buildCanonicalSpeakerMap(messagesArray, currentSenderId, currentSenderName)`:**
   - Lấy danh sách `senderId` duy nhất có trong lịch sử `messagesArray` + `currentSenderId` (chỉ 2–5 người/nhóm).
   - Tra song song `getUserProfile(uid)` qua RAM cache 5 phút ($0 Firestore reads lặp lại).
   - Chuẩn hóa động nhãn hiển thị cho từng `uid`:
     - `realName = profile?.real_name || profile?.name || fallbackName`
     - `honorific = (profile?.gender && /nữ|female|woman/i.test(profile.gender)) ? "chị" : "anh"`
     - Nhãn chuẩn: `${honorific} ${realName}` (tránh lặp nếu tên đã có sẵn `anh `/`chị `).
2. **Áp dụng nhãn chuẩn cho TOÀN BỘ đầu vào LLM:**
   - Toàn bộ `history` (kể cả tin nhắn cũ còn lưu `senderName="Badpaybad"` trong RTDB) đều được chuẩn hóa động thành `[anh Du]: ...`, `[anh Lâm]: ...`.
   - Tin nhắn mới nhất `[NEW] [${canonicalCurrentSender}]: ...` cũng mang đầy đủ danh xưng + tên thật.
   - Nhờ Ground Truth đầu vào đồng nhất 100%, LLM không bao giờ còn nhìn thấy nick cũ hay tên trống không, tự nhiên gọi chuẩn `anh/chị + tên thật` xuyên suốt mọi phản hồi trên cả LINE và Telegram mà không hardcode bất kỳ tên nào.
