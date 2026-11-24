# Kế hoạch Kiến trúc: Independent AI Reviewer & BARS 100-Point Evaluation Cronjob (2026-11-24)

## 1. Mục tiêu & Nguyên tắc Thiết kế
Xây dựng một **Giám khảo Độc lập (Independent AI Reviewer)** tự động đánh giá chất lượng thực tế của chatbot Annie mỗi ngày 1 lần, gửi báo cáo chi tiết về Telegram của Sếp Eddy (`2140581850`), đảm bảo:
1. **$0 Chi phí Hạ tầng (Zero Extra Infra Cost):** Gắn trực tiếp vào nhịp chạy `08:00 AM` sẵn có của `masterScheduler` (ngay trước bước nén ký ức 08:00 để giữ trọn tin nhắn thô), không tạo thêm Cloud Scheduler hay Cloud Function mới.
2. **Độc lập Chéo Mô hình (Cross-Model Independence):** Dùng **Gemini (`gemini-2.5-flash` JSON mode)** làm Giám khảo chính để chấm điểm câu trả lời của **DeepSeek** (tự động fallback sang DeepSeek `temperature: 0.1` nếu Gemini nghẽn), loại bỏ thiên kiến tự khen (self-preference bias).
3. **Chấm điểm Khoa học, Không Xung đột (MECE + BARS Rubric 100 điểm):** 4 trụ cột hoàn toàn tách biệt phạm vi (Mutually Exclusive), neo điểm bằng các hành vi quan sát được (Behaviorally Anchored Rating Scales) kết hợp **chỉ số đo lường cứng bằng JS (Hard Telemetry)** trước khi gọi AI.
4. **Chống Nhảy Điểm Vô Cớ (Longitudinal Evidence-Backed Delta):** Lưu lịch sử 14 kỳ chấm gần nhất tại `system_configs/bot_reviews_history` (1 read/write mỗi ngày). Mọi tăng/giảm điểm so với kỳ trước bắt buộc kèm lý do + trích dẫn log/số liệu thực tế.

---

## 2. Bộ Tiêu chí Chấm điểm BARS 100 Điểm (Không Xung đột)

| Trụ cột | Thang điểm | Phạm vi Độc lập (Không chồng chéo) | Neo hành vi (BARS) |
|---|---|---|---|
| **1. Thông minh (Intelligence)** | **30đ** | Chiều sâu tư duy, hiểu ẩn ý/ngữ cảnh ngầm, tính hợp lý và giá trị giải quyết vấn đề. *(Không chấm xưng hô hay thời điểm).* | `26-30`: Thấu hiểu ẩn ý, sắc sảo, giải pháp/sáng tác chất lượng cao.<br>`19-25`: Đúng bề mặt, hợp lý nhưng còn chung chung.<br>`11-18`: Hời hợt, văn mẫu.<br>`0-10`: Hiểu sai vấn đề, suy luận ngớ ngẩn. |
| **2. Tinh tế (Subtlety & EQ)** | **25đ** | Độ tự nhiên như người thật, xưng hô `anh/chị + tên thật`, độ duyên dáng và nhịp độ/độ dài khi góp lời chủ động. *(Không chấm đúng/sai kiến thức).* | `22-25`: Tự nhiên, gần gũi, chuẩn xưng hô 100%, proactive đúng lúc & ngắn gọn 1 câu.<br>`16-21`: Thân thiện nhưng đôi chỗ hơi dài/mùi sách vở.<br>`9-15`: Rào đón máy móc (*"em nói thật..."*), gọi trống không, proactive hơi dài/vô duyên.<br>`0-8`: Lộ thẻ XML, spam chen ngang, giọng điệu phản cảm. |
| **3. Chính xác (Accuracy & Focus)** | **25đ** | Trả lời đúng trọng tâm câu hỏi `[NEW]` (Single-Focus), đúng dữ kiện thực tế, đúng mốc thời gian, không nhầm người. *(Không chấm văn phong).* | `22-25`: Trúng đích 100% câu hỏi mới, Zero Hallucination, đúng người/thời gian.<br>`16-21`: Đúng ý chính nhưng còn lan man chi tiết phụ.<br>`9-15`: Lạc đề sang chuyện cũ, trả lời ké tin cũ, lệch số liệu nhỏ.<br>`0-8`: Ảo giác bịa đặt, nhầm người nghiêm trọng, lạc đề hoàn toàn. |
| **4. Khả năng Tiến bộ (Evolution)** | **20đ** | Mức độ khắc phục lỗi kỳ trước + hiệu quả áp dụng nâng cấp mới (`bot_skills`, `human_insights`, `taxonomy`, `guardrails`). | `17-20`: Xóa sổ lỗi kỳ trước, vận dụng mượt skills/cải tiến mới.<br>`13-16`: Ổn định, tự học đều nhưng chưa có tình huống đột phá.<br>`7-12`: Dậm chân tại chỗ, lặp lại lỗi cũ.<br>`0-6`: Thoái trào chất lượng hoặc lỗi luồng tự học. |

### Thang Kết luận Chung (Tính toán cứng bằng JS từ tổng 4 trụ cột)
- **85 – 100 điểm:** 🏆 **Xuất sắc**
- **70 – 84 điểm:** ✅ **Tốt**
- **50 – 69 điểm:** ⚠️ **Trung bình**
- **0 – 49 điểm:** 🚨 **Tồi**

---

## 3. Luồng Thu thập Dữ liệu Đa Tầng (Cross-Platform Ground Truth)
1. **QA Interaction Trace Buffer (`logs/qa_traces/YYYY-MM-DD` trên RTDB — $0 Write):**
   - Mỗi lần bot phản hồi trên LINE hoặc Telegram, ghi bất đồng bộ 1 bản ghi siêu nhẹ (~400 bytes): thời gian, nền tảng, chế độ (`DIRECT` / `FOCUS` / `PROACTIVE`), tên người gửi, câu hỏi, câu trả lời, độ trễ `latencyMs`. Tự động xoay vòng xóa sau 3 ngày (Zero Bloat).
2. **Hard Telemetry Scanner (JS Offline — $0):**
   - Tự đếm trước khi đưa vào Judge: số lượt `DIRECT` vs `PROACTIVE`, độ dài trung bình câu trả lời, số câu proactive vượt quá 25 từ, số lần lỡ dùng văn mẫu rào đón (*"em nói thật"*, *"chưa xác thực"*), số lần rò rỉ thẻ kỹ thuật (`<PROFILE`, `*` lẻ...).
3. **Cross-Project Aggregation:**
   - Gom dữ liệu 24h qua từ cả `line-ai-chatbot-eab18` và `tele-ai-chatbot` (traces + tin nhắn chưa nén + `summaries` 24h + `logs/system_logs` tiến hóa + `bot_skills` + lịch sử điểm hôm qua).
   - Nếu 24h qua có `< 2` lượt tương tác thực tế: gửi báo cáo ngắn trạng thái **Standby (Ít tương tác)** giữ nguyên điểm nền để chống nhảy điểm ảo và tiết kiệm 100% token Judge.

---

## 4. Các Hạng mục Triển khai
1. **Tạo mới** [reviewer.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/reviewer.js): Thu thập dữ liệu xuyên dự án, tính Hard Metrics, gọi Independent Judge (Gemini → DeepSeek fallback), chuẩn hóa điểm & delta, lưu lịch sử và gửi báo cáo tới Telegram ID `2140581850`.
2. **Cập nhật** [index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/index.js):
   - Ghi `recordQaTrace` (fire-and-forget) sau khi gửi tin nhắn trên Telegram & LINE.
   - Kích hoạt `runIndependentReview()` trong `masterScheduler` lúc `08:00 AM` (ngay trước bước nén ký ức 08:00, kèm cờ chống lặp `reviewer/daily_${dateKey}`).
   - Dọn `logs/qa_traces` quá hạn (> 3 ngày) trong khối Log Rotation 03:00 AM.
3. **Cập nhật** [commands/index.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/commands/index.js): Thêm lệnh `/review` để Sếp có thể chủ động test/chạy đánh giá ngay bất cứ lúc nào.
4. **Cập nhật** [features.md](file:///Users/snow/Documents/www/LINE-Chatbot/docs/features.md) (Mục 30).
