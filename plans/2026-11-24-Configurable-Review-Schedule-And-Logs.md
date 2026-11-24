# Kế hoạch Nâng cấp: Lưu trữ Đầy đủ Log Chấm điểm cho Antigravity & Chu kỳ Chấm điểm Động theo `.env` (1–30+ Ngày) — 2026-11-24

## 1. Lưu trữ Log Chấm điểm & Tích hợp Skill cho Antigravity IDE
1. **Nơi lưu trữ chính thức (Single Source of Truth):**
   - Firestore document: **`system_configs/bot_reviews_history`** (đồng bộ 2 chiều cả `line-ai-chatbot-eab18` và `tele-ai-chatbot`, giữ tối đa 24 kỳ gần nhất — chỉ tốn 1 doc < 150KB).
   - Mỗi bản ghi lưu **đầy đủ 100% thông tin** (không chỉ điểm số):
     - `date`, `timestamp`, `windowDays`, `judgeModel`, `totalScore`, `verdict`
     - `scores`: `{ intelligence, subtlety, accuracy, evolution }`
     - `pillars_analysis`: nhận xét chi tiết & dẫn chứng từng trụ cột
     - `delta_explanation`: giải trình nguyên nhân tăng/giảm điểm
     - `weaknesses`: danh sách điểm yếu cần khắc phục
     - `next_upgrades`: danh sách đề xuất nâng cấp "Wow"
     - `hardMetrics`: thống kê toàn kỳ (kèm so sánh xu hướng đầu kỳ vs cuối kỳ)
     - `reportText`: toàn văn báo cáo đã gửi Telegram
2. **Công cụ & Skill cho Antigravity IDE:**
   - Script [read_bot_reviews.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/scratch/read_bot_reviews.js) đọc nhanh các kỳ chấm điểm mới nhất.
   - Skill [SKILL.md](file:///Users/snow/Documents/www/LINE-Chatbot/.agents/skills/review/SKILL.md) để bất cứ khi nào Sếp bảo Antigravity *"đọc log chấm điểm / xem đánh giá reviewer để nâng cấp bot"*, AI lập tức biết đường dẫn đọc `bot_reviews_history`, tổng hợp điểm yếu + `next_upgrades` và đề xuất phương án cải tiến.

---

## 2. Cấu hình Chu kỳ Động qua `.env` & Bảo toàn Đủ Log Toàn Kỳ (1 Ngày → 7 Ngày → 30 Ngày)
1. **Biến môi trường trong `.env`:**
   - `REVIEW_INTERVAL_DAYS=1`: Chu kỳ chấm tự động (`1` = hàng ngày, `7` = 7 ngày/lần, `30` = 1 tháng/lần, `0` = tắt cron tự động).
   - `REVIEW_HOUR=8`: Giờ chạy trong ngày theo múi giờ Việt Nam (mặc định `8` = 08:00 AM).
2. **Cơ chế Kiểm tra Đến Hạn (`isReviewDue`):**
   - Dựa vào `lastReview.date` trong `system_configs/bot_reviews_history`, tính số ngày thực tế đã trôi qua `daysSinceLast`.
   - Khi `daysSinceLast >= REVIEW_INTERVAL_DAYS`, tự động kích hoạt và đặt cửa sổ thu thập dữ liệu `windowDays = Math.min(Math.max(daysSinceLast, REVIEW_INTERVAL_DAYS), 40)` — đảm bảo **cover trọn vẹn 100% khoảng thời gian kể từ lần chấm trước**, không hụt ngày nào.
3. **Tự động Co giãn Thời gian Giữ Log (Dynamic Log Retention — Zero Bloat):**
   - Trong `masterScheduler` (Log Rotation 03:00 AM), thời gian giữ `logs/qa_traces` và `logs/system_logs` tự động tính theo `Math.min(Math.max(REVIEW_INTERVAL_DAYS + 3, 7), 40)` ngày.
   - Kể cả khi để `REVIEW_INTERVAL_DAYS=30`, dung lượng 33 ngày `qa_traces` chỉ ~350KB (< 0.04% Free Tier 1GB của RTDB → **$0 chi phí**).
4. **Thuật toán Lấy mẫu Phân tầng Đa Ngày (Time-Stratified Sampling — Giữ nguyên chi phí Token thấp):**
   - **Hard Telemetry tính trên 100% toàn bộ lượt chat của cả kỳ** (dù là 1 ngày hay 30 ngày), đồng thời tách so sánh **Nửa đầu kỳ vs Nửa cuối kỳ** để đo xu hướng tiến bộ thực chất.
   - **Mẫu gửi vào LLM Judge (tối đa 30 mẫu tiêu biểu):** Ưu tiên bắt toàn bộ mẫu có dấu hiệu bất thường + mẫu Proactive + lấy mẫu phân tầng đều từ đầu kỳ → giữa kỳ → cuối kỳ, giúp chi phí chấm 30 ngày vẫn rẻ ngang chấm 1 ngày (~$0.001/lần).
