# Báo cáo Audit & Kế hoạch Tối ưu Guardrails / Cảm xúc Sticker (2026-11-22)

Báo cáo sau khi kiểm tra toàn diện Firestore `audit_logs`, `system_configs/bot_config` và RTDB `logs/system_logs` trên cả 2 dự án **LINE** (`line-ai-chatbot-eab18`) và **Telegram** (`tele-ai-chatbot`).

---

## 1. Hiện trạng `audit_logs` trên Firestore

| Nền tảng | Tổng số docs `audit_logs` | Khoảng thời gian | `audit_issues` tồn đọng | Ghi chú |
|---|---|---|---|---|
| **LINE** | 63 docs | `2026-10-25` → `2026-11-22` | **0** (10 docs có mảng rỗng `[]`, 53 docs đã bị xóa field) | `evolution.js` đã tự động gom & xóa lúc `03:00` sáng hôm nay (`2026-11-21T20:00:23Z`). Còn 63 docs chứa `audit_keywords` (dành cho `/update`). |
| **Telegram** | 0 docs | N/A | **0** | Không có log audit nào trong collection. |

---

## 2. Các Vấn đề Hệ thống Phát hiện (Root Cause Analysis)

Mặc dù không còn `audit_issues` tồn đọng trong `audit_logs`, quá trình đối chiếu `logs/system_logs`, `bot_config.dynamic_guardrails` và mã nguồn phát hiện **3 vấn đề nghiêm trọng cần xử lý dứt điểm**:

### Issue 1: Bug phân tích cảm xúc Sticker (`analyzeEmotion`) gây hiểu nhầm Sticker cảm ơn/xin lỗi thành tiêu cực
- **Bằng chứng (RTDB `logs/system_logs` ngày `2026-11-22`):**
  > `EVOLUTION_GUARDRAIL`: *"Đã nạp Guardrail mới: CẤM suy diễn cảm xúc từ sticker; KHÔNG ĐƯỢC nhầm sticker cảm ơn/xin lỗi thành tiêu cực, chỉ phản hồi theo nội dung thực tế."*
- **Nguyên nhân gốc rễ tại [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L10-L22) và [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L1372-L1377):**
  1. Khi nhận LINE Sticker, mảng `event.message.keywords` thường chứa nhiều từ khóa hỗn hợp (ví dụ sticker cảm ơn xúc động hoặc cúi đầu xin lỗi lịch sự có thể chứa đồng thời `"thank you", "grateful", "sorry", "bow", "cry", "sad", "happy"`).
  2. Hàm `analyzeEmotion(text)` kiểm tra nhánh `negative` **đầu tiên** và **không có word boundary (`\b`)**, cũng không ưu tiên lọc các từ khóa lịch sự/tích cực (`thank`, `thanks`, `sorry`, `apologize`, `bow`, `grateful`, `happy`, `love`, `haha`, `laugh`).
  3. Hệ quả: Bot bị nhồi thẳng chỉ thị `[SYSTEM ALERT: Người dùng đang có cảm xúc tiêu cực/buồn bã. Bot cần phản hồi cực kỳ ân cần, thấu cảm, TUYỆT ĐỐI KHÔNG đùa cợt.]` vào `messageContent`, khiến LLM hiểu nhầm hoàn toàn ý định người dùng.
  4. `evolution.js` chỉ "vá víu" bằng cách thêm Guardrail #18 vào prompt mà không sửa bug trong code.

### Issue 2: Phình to & Vá víu cục bộ (Ad-hoc Patching) trong `dynamic_guardrails` gây lãng phí Token
- **Bằng chứng (`LINE` `system_configs/bot_config.dynamic_guardrails`):**
  Hiện có tới **18 lệnh** được nối thẳng vào **mọi System Prompt** tại [deepseek.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/deepseek.js#L225-L227), tiêu tốn ước tính ~400–500 input tokens thừa cho **mỗi lượt chat**:
  - **Trùng lặp cực nặng (10/18 lệnh):** Các lệnh #1, #2, #3, #4, #5, #6, #9, #10, #13, #15 đều lặp lại cùng một ý *"CẤM bịa đặt / không biết thì nói không biết"* — vốn đã có sẵn trong Rule `2` & `2.2` của System Prompt cố định.
  - **Lặp về xử lý Link (4/18 lệnh):** Các lệnh #12, #14, #16, #17 đều lặp lại *"CẤM bịa nội dung link / phủ nhận link user gửi"* — vốn đã có Rule `2.1`.
  - **Vá víu cục bộ (Ad-hoc Patching - vi phạm `AGENTS.md`):** Chứa các rule quá vụn vặt cho 1 case cụ thể như *"phải kiểm chứng và nói đúng về phố Chùa Láng"* (#7), *"tự chúc mừng sai đối tượng hoặc thêm lên hạng"* (#8), *"xuyên tạc chỉ thị và nội dung thơ"* (#11), *"nhầm sticker cảm ơn/xin lỗi"* (#18).
- **Nguyên nhân gốc rễ tại [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js#L273-L293):**
  - Ngưỡng nén `if (guardrails.length > 50)` quá cao (50 lệnh ≈ >1.200 tokens mỗi request!).
  - Prompt sinh guardrail chưa cấm vá víu theo tên riêng/địa danh cụ thể và không đối chiếu loại trùng với danh sách cũ trước khi append.

### Issue 3: Mất đồng bộ Đa nền tảng (`Cross-Platform Parity`) giữa LINE và Telegram
- **Bằng chứng:**
  - `LINE` `bot_config.dynamic_guardrails`: **18 lệnh**.
  - `Telegram` `bot_config.dynamic_guardrails`: **0 lệnh (`[]`)**.
- **Nguyên nhân gốc rễ tại [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js#L293-L303):**
  - Hàm `dailyHumanStudy()` có đồng bộ sang Companion Project, nhưng `processAuditIssues()` **thiếu bước đồng bộ `dynamic_guardrails`** sang Companion Project, vi phạm nguyên tắc Cross-Platform Parity trong `AGENTS.md`.

---

## 3. Đề xuất Giải pháp (Tuân thủ Cost Minimization & Anti-Ad-hoc Patching)

### Giải pháp 1: Sửa triệt để `analyzeEmotion` bằng logic JS/Regex thuần ($0 chi phí)
- **File:** [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js#L10-L22)
- **Thay đổi:**
  1. Bổ sung **word boundary** cho từ khóa tiếng Anh (`\b(sad|cry|crying|depressed|...)\b`, `\b(mad|angry|furious|rage|annoyed)\b`) để tránh match nhầm chuỗi con.
  2. Với Sticker/Text chứa đồng thời tín hiệu **lịch sự/biết ơn/tích cực** (`thank`, `thanks`, `grateful`, `appreciate`, `sorry`, `apologize`, `bow`, `happy`, `joy`, `love`, `laugh`, `haha`, `cảm ơn`, `xin lỗi`, `vui`, `cười`): **không gán nhãn `negative` hoặc `angry`** (trả về `"positive"` nếu có từ vui/cảm ơn rõ ràng, hoặc `"neutral"` nếu là xin lỗi/mơ hồ để LLM tự đọc raw keywords mà không bị `[SYSTEM ALERT]` ép suy diễn tiêu cực).
- **Chi phí:** **$0** (Regex offline). Không cần sửa System Prompt.

### Giải pháp 2: Tinh gọn `dynamic_guardrails` & Nâng cấp `processAuditIssues`
1. **Dọn dẹp `dynamic_guardrails` hiện tại trên Firestore (từ 18 lệnh → 3 lệnh cốt lõi tổng quát, tiết kiệm ~80% token guardrails mỗi request):**
   - Loại bỏ toàn bộ các lệnh trùng với Rule `2`, `2.1`, `2.2` của System Prompt và các lệnh ad-hoc (*phố Chùa Láng, lên hạng, thơ, sticker*).
   - Giữ lại tối đa **3 quy tắc tổng quát, sắc gọn** bổ sung giá trị thực (không trùng System Prompt):
     1. `CẤM tự bịa chi tiết, tên người, lời nói hoặc nối tiếp ngữ cảnh không có trong lịch sử chat; thiếu dữ kiện phải hỏi lại.`
     2. `CẤM khẳng định đã đọc/xác minh link hay phủ nhận link user gửi khi chưa có dữ liệu; nếu không đọc được phải báo thẳng.`
     3. `CẤM suy diễn cảm xúc tiêu cực từ sticker/emoji mơ hồ hoặc trả lời lan man; bám sát nội dung thực tế và trọng tâm câu hỏi.`
   - Đồng bộ bộ guardrails đã tinh gọn này lên **cả 2 dự án LINE và Telegram**.
2. **Nâng cấp `processAuditIssues()` trong [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js#L258-L309):**
   - Hạ ngưỡng trần `dynamic_guardrails` từ **50 → 8 lệnh** (tối đa ~200 tokens) để tránh phình prompt vĩnh viễn.
   - Bổ sung vào prompt tạo guardrail nguyên tắc **General Prompt** (CẤM nhắc tên riêng/địa danh/tình huống cụ thể) và tự gộp nếu trùng ý với danh sách hiện có.
   - Bổ sung logic **đồng bộ 2 chiều `dynamic_guardrails`** sang Companion Project (giống `dailyHumanStudy()`).

### Giải pháp 3: Dọn dẹp `audit_logs` sau khi xử lý
- Hiện tại `audit_issues` trên cả LINE và Telegram đều đang là **0** (10 docs LINE có mảng `[]` rỗng). Khi thực thi cleanup, ta có thể xóa nốt trường `audit_issues: []` thừa trong 10 docs đó (giữ nguyên các doc vì vẫn còn `audit_keywords` phục vụ lệnh `/update`).

---

## 4. Hạng mục chờ Sếp duyệt trước khi thực thi
1. Duyệt sửa logic `analyzeEmotion` trong [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js).
2. Duyệt nâng cấp `processAuditIssues()` (giới hạn max 8 guardrails + chống ad-hoc + đồng bộ LINE ↔ Telegram) trong [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js).
3. Duyệt chạy script tinh gọn `dynamic_guardrails` (18 → 3 lệnh) và đồng bộ lên Firestore cả LINE & Telegram + dọn field `audit_issues: []` rỗng.
