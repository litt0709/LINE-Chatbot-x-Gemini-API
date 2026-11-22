# Kế hoạch Kiến trúc: Hierarchical Semantic Taxonomy & Autonomous Nightly Evolution (2026-11-22)

## 1. Bối cảnh & Vấn đề của Cơ chế Cũ
- `bot_config.search_keywords` hiện lưu phẳng **~2.000+ từ khóa** dưới dạng chuỗi Regex khổng lồ (`GENERAL: 626`, `DEV: 465`, `NEWS: 448`, `FINANCE: 285`, `SOCIAL: 266` cùng nhiều category thừa như `FINANCE/NEWS`, `TECH/SOCIAL`, `HR`, `CAREER` không được `search.js` đọc).
- Cơ chế cũ có 4 nhược điểm lớn:
  1. **Phình to vô hạn bởi tên riêng:** Lưu hàng trăm tên cá nhân/sự kiện nhất thời (`jensen huang`, `mr pips`, `vf3`, `shark bình`...) nhưng không khái quát hóa được cho sự kiện mới.
  2. **Định tuyến `if/else` tuyến tính dễ bắt nhầm:** `DEV` → `SOCIAL` → `NEWS` chỉ cần dính 1 từ khóa trùng là định tuyến sai Search Engine.
  3. **Không phân tầng Domain → Sub-topic:** Không biết truy vấn thuộc nhánh con nào (`TECH > security` vs `SOCIETY_VN > law_policy` vs `ECONOMY > markets`).
  4. **Phụ thuộc thao tác thủ công:** Sếp phải tự gọi `/update` định kỳ để gom `audit_logs`.

---

## 2. Kiến trúc Mới: 3-Layer Hierarchical Taxonomy + Autonomous Evolution

### 2.1. Cây Phân loại 3 Tầng (`bot_config.taxonomy`)
Thay vì danh sách phẳng 2.000 từ, hệ thống quản lý **6 Macro Domains → 15 Sub-topics → Weighted Common Concepts** (chỉ lưu khái niệm phổ quát, **TUYỆT ĐỐI KHÔNG lưu tên riêng cá nhân/sự kiện đơn lẻ**):

| Tầng 1 (Domain) | Tầng 2 (Sub-topic) | Search Engine | Tavily Topic | Vai trò |
|---|---|---|---|---|
| `TECH` | `ai_llm`, `software_dev`, `security`, `hardware` | `EXA` | `general` | Công nghệ, lập trình, AI, bảo mật, phần cứng |
| `ECONOMY` | `markets`, `business` | `TAVILY` | `news` | Chứng khoán, vàng, tỷ giá, crypto, doanh nghiệp, vĩ mô |
| `SOCIETY_VN` | `law_policy`, `urban_life`, `people_culture` | `TAVILY` | `news` | Pháp luật, chính sách, đô thị, giao thông, văn hóa — con người VN |
| `WORLD_GEO` | `geopolitics`, `global_events` | `TAVILY` | `news` | Địa chính trị, ngoại giao, bầu cử, xung đột, sự kiện toàn cầu |
| `SOCIAL_TREND` | `viral_drama` (`EXA`), `sports_ent` (`TAVILY news`) | Mixed | Mixed | Drama/MXH, thể thao, giải trí |
| `LIFESTYLE` | `shopping_review`, `career_work`, `travel_food` | `TAVILY` | `general` | Mua sắm, review, sự nghiệp, du lịch, ẩm thực, thời tiết |

### 2.2. Nguyên tắc Zero-Entity Bloat & Weighted Scoring (`functions/utils/taxonomyRouter.js`)
- **Chấm điểm có trọng số (<1ms, $0 API cost, ~1MB RAM):**
  - So khớp cả chuỗi gốc và chuỗi bỏ dấu (`removeAccents`) theo ranh giới từ (Unicode-safe word boundary).
  - `core` concept = **+3 điểm** (+0.5 nếu là cụm đa từ đặc thù); `context` concept = **+1 điểm**.
  - Tính điểm song song toàn bộ 15 nhánh con → chọn `(domain, subTopic)` có điểm cao nhất.
- **Xử lý tên riêng thông minh không cần lưu danh sách:**
  - *"Jensen Huang từ chức"* → khớp `từ chức` (`ECONOMY > business`) → `TAVILY news`.
  - *"cổ phiếu Nvidia"* → khớp `cổ phiếu` (`ECONOMY > markets`) → `TAVILY news`.
  - *"Jensen Huang là ai?"* / *"VF3 ổn không?"* → điểm 0 → rơi vào **`GENERAL` (`TAVILY general`)**.

### 2.3. Tự động Tiến hóa Hàng đêm (`evolveTaxonomyFromLogs` trong `functions/utils/evolution.js`)
- Chạy tự động mỗi đêm lúc **`03:00` sáng** trong `runDailyEvolution()` (`masterScheduler`).
- **Chống chạy lặp đa nền tảng:** Dùng cờ `last_taxonomy_update_date` (`YYYY-MM-DD` GMT+7) đồng bộ giữa LINE & Telegram.
- **Chi phí cực thấp (~$0.0005/ngày):** Gom toàn bộ `audit_logs` trong ngày vào **1 batch call DeepSeek duy nhất** (nếu không có log mới → skip với $0).
- **Taxonomy Architect Prompt:**
  - Loại bỏ 100% tên riêng cá nhân, biệt danh nhóm chat, từ đơn dễ gây nhiễu.
  - Khái quát hóa thành khái niệm phổ quát và gắn đúng nhánh `Domain > SubTopic`.
  - **Hard Cap chống phình to:** Tối đa `25` concepts/sub-topic, tối đa `150` `proactive_trigger_words` (chỉ cụm >= 2 từ), tối đa `200` `standalone_topics`.
- **Cross-Platform Parity & Inbox Zero:** Tự động đồng bộ `taxonomy` + `proactive_trigger_words` + `link_requests_regex` sang Companion Project (`LINE ↔ Telegram`), dọn sạch các trường đã xử lý trong `audit_logs` (xóa luôn doc rỗng), và ghi log `EVOLUTION_TAXONOMY` vào RTDB để theo dõi qua `/learning`.

---

## 3. Các File Triển khai
1. **Tạo mới** [taxonomyRouter.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/taxonomyRouter.js): Định nghĩa `DEFAULT_TAXONOMY`, `classifyQuery()`, `mergeTaxonomy()`.
2. **Cập nhật** [search.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/search.js): Thay `CATEGORY_REGEX` phẳng bằng `classifyQuery(finalQuery, botConfig.taxonomy)` (giữ fallback an toàn).
3. **Cập nhật** [evolution.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/evolution.js): Bổ sung `evolveTaxonomyFromLogs()` vào `runDailyEvolution()`.
4. **Cập nhật** [configCache.js](file:///Users/snow/Documents/www/LINE-Chatbot/functions/utils/configCache.js): Bổ sung fallback `taxonomy: null`.
5. **Migrate Firestore:** Nạp cây `taxonomy` chuẩn lên `system_configs/bot_config` trên cả **LINE** & **Telegram**.
6. **Kiểm thử & Tài liệu:** Chạy test suite 15+ câu hỏi thực tế & cập nhật [features.md](file:///Users/snow/Documents/www/LINE-Chatbot/docs/features.md).
