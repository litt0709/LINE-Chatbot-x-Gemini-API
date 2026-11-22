# Kế Hoạch: Giả Lập Request End-User Đọc Nội Dung Link Amazon & Trang Bán Hàng

## 1. Bối cảnh & Nguyên nhân gốc rễ (Root Cause)
- **Thực trạng:** Khi Eddy gửi link Amazon trên Telegram chat 1-1, bot phản hồi không đọc được nội dung đường link.
- **Nguyên nhân cốt lõi:**
  1. Trong lần cập nhật trước, code tại `functions/utils/search.js` đã thêm bộ lọc chặn cào trực tiếp các domain bán hàng (`amazon`, `shopee`, `tiktok`, `lazada`), trả về ngay `null` mà không gửi bất kỳ HTTP request nào.
  2. Fallback tìm kiếm Tavily trước đó bị giới hạn domain cứng (`include_domains`) trong danh sách 50 trang tin tức (`trusted_sources.json`), khiến việc tìm kiếm trang sản phẩm Amazon bị rỗng.
  3. Header gửi đi trước đây thiếu bộ nhận diện End-User hiện đại (Client Hints: `sec-ch-ua`, `sec-fetch-*`), khiến một số trang e-commerce dễ nghi ngờ là scraper/script.
- **Thực nghiệm xác thực:**
  - Khi gửi request với bộ Headers đầy đủ của Trình duyệt End-User (Chrome 131 Desktop với đầy đủ Sec-CH-UA và Sec-Fetch headers), Amazon trả về HTTP 200 thành công với toàn bộ 3MB HTML, không dính Captcha hay Akamai Bot Manager.
  - Trích xuất thành công Title, Price, Byline, Description của sản phẩm.
  - API `https://api.tavily.com/extract` (đã có sẵn API key) cũng hoạt động trơn tru nếu cần làm phương án dự phòng (Fallback).

---

## 2. Giải pháp kỹ thuật thông minh

### A. Chuẩn hóa Headers giống 100% Trình duyệt End-User (`ENDUSER_BROWSER_HEADERS`)
- Cấu hình headers mô phỏng chuẩn xác một lượt click link của người dùng thật từ trình duyệt Chrome / macOS:
  - `User-Agent`: Desktop Chrome 131 hiện đại.
  - `Accept`: `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7`
  - `Accept-Language`: `vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7`
  - `Accept-Encoding`: `gzip, deflate, br`
  - `sec-ch-ua`: `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`
  - `sec-ch-ua-mobile`: `?0`
  - `sec-ch-ua-platform`: `"macOS"`
  - `sec-fetch-dest`: `document`
  - `sec-fetch-mode`: `navigate`
  - `sec-fetch-site`: `none`
  - `sec-fetch-user`: `?1`
  - `upgrade-insecure-requests`: `1`
  - `Cache-Control`: `max-age=0`

### B. Xóa bỏ logic chặn cứng Domain bán hàng trong `scrapeUrl`
- Bỏ đoạn mã chặn `amazon`, `shopee`, `tiktok`, `lazada` để cho phép bot luôn thực hiện request End-User trước tiên.
- Hỗ trợ tự động chuyển hướng (`maxRedirects: 5`) để giải quyết các link rút gọn phổ biến của Amazon như `a.co/d/...` hoặc `amzn.to/...`.

### C. Bộ bóc tách thông minh cho trang Amazon (`parseAmazonHtml`)
- Nhận diện trang Amazon và trích xuất cấu trúc gọn gàng, loại bỏ các thẻ script/tracking thừa:
  - Tên sản phẩm: `#productTitle` hoặc `<title>`
  - Giá: `#corePrice_feature_div`, `.a-price .a-offscreen`, v.v.
  - Tác giả / Thương hiệu: `#bylineInfo`
  - Tính năng chính: `#feature-bullets`
  - Mô tả: `#productDescription` hoặc `#bookDescription_feature_div`
- Đóng gói thành định dạng văn bản súc tích để đưa vào `[NỘI DUNG URL NGƯỜI DÙNG GỬI ĐẾN]` cho LLM.

### D. Kiến trúc Fallback 2 lớp thông minh ($0 token phí phạm)
1. **Lớp 1 - End-User Request:** Gửi trực tiếp qua Axios với `ENDUSER_BROWSER_HEADERS`.
2. **Lớp 2 - Tavily Extract API:** Nếu Lớp 1 bị lỗi mạng hoặc dính Captcha/WAF, gọi `https://api.tavily.com/extract` (sử dụng residential proxy và headless rendering).
3. **Lớp 3 - Tavily/Exa Open Search:** Tìm kiếm slug hoặc URL trên toàn web mà không bị chặn bởi bộ lọc 50 domain tin tức.

---

## 3. Các bước triển khai
1. Cập nhật `functions/utils/search.js`:
   - Thêm `ENDUSER_BROWSER_HEADERS`.
   - Thêm hàm `parseAmazonHtml(html)`.
   - Thêm hàm `extractWithTavily(url)`.
   - Cập nhật `scrapeUrl` và `resolveWebContext` để áp dụng quy trình 3 lớp.
2. Cập nhật `functions/utils/tavily.js`: Cho phép bỏ qua hoặc ghi đè `include_domains` khi thực hiện fallback search theo URL.
3. Kiểm thử cú pháp Node.js (`node -c`).
4. Chạy kiểm thử độc lập với URL Amazon thực tế để xác nhận trích xuất thành công dữ liệu sản phẩm.
5. Cập nhật tài liệu `docs/features.md`.
6. Báo cáo kết quả và chỉ deploy khi người dùng yêu cầu.
