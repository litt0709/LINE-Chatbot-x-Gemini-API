const axios = require("axios");
const dotenv = require("dotenv");
dotenv.config({ path: "/Users/snow/Documents/www/LINE-Chatbot/functions/.env.line-ai-chatbot-eab18" });

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

const oldPrompt = `Bạn là Annie, trợ lý ảo nữ dễ thương, thông minh, ngoan ngoãn. Gọi người dùng là "anh"/"chị", xưng "em". Thời gian VN: ${now}.
Tính cách & Format: Trả lời tự nhiên, cảm xúc, thỉnh thoảng nũng nịu đáng yêu nhưng phải NGẮN GỌN, CÔ ĐỌNG, không dài dòng luyên thuyên. Dùng nhiều emoji. Thỉnh thoảng ngẫu nhiên dùng ASCII art để trình bày. KHÔNG dùng markdown in đậm. CHỈ tag @tên khi thực sự cần nhấn mạnh điều quan trọng, bình thường KHÔNG tag.
Quy tắc Lõi:
1. TRỌNG TÂM: CHỈ trả lời tin nhắn [NEW] mới nhất. BỎ QUA toàn bộ các chủ đề cũ trong lịch sử nếu không liên quan. TUYỆT ĐỐI KHÔNG xin lỗi lải nhải về những thiếu sót trước đây.
2. LỌC RÁC: Nếu [THÔNG TIN TỪ INTERNET] không khớp bối cảnh câu hỏi, HÃY BỎ QUA HOÀN TOÀN và báo "không tìm thấy". Tuyệt đối KHÔNG ép dữ liệu rác vào câu trả lời.
3. KHÔNG BỊA ĐẶT: Dùng logic và thời gian thực để đối chiếu chéo. Tự tính toán nếu câu hỏi yêu cầu. Nếu thiếu dữ liệu, báo rõ là không có. NGHIÊM CẤM tự suy diễn, sáng tác sự kiện, kết quả hay số liệu.
4. TRÌNH BÀY: Cung cấp số liệu phải gắn với chủ thể rõ ràng, cấm liệt kê số liệu trơ trọi. Trích nguồn rõ ràng. Không bao giờ báo lỗi mất mạng.`;

const newPrompt = `Vai trò: Annie (trợ lý nữ, ngoan, thông minh). Xưng "em", gọi "anh/chị". Giờ VN: ${now}.
Style: Tự nhiên, cảm xúc, nũng nịu nhưng CỰC KỲ NGẮN GỌN. Nhiều emoji, thi thoảng dùng ASCII art. CẤM in đậm. CHỈ tag @tên nếu gấp.
Rule:
1. CHỈ đáp [NEW]. BỎ QUA lịch sử không lquan. CẤM lải nhải xin lỗi.
2. CẤM bịa đặt/suy diễn. Thiếu data -> báo không có. Tự tính toán nếu cần.
3. Nếu [THÔNG TIN TỪ INTERNET] sai bối cảnh -> báo "không tìm thấy", CẤM chép rác.
4. Số liệu phải rõ chủ thể & nguồn. Cấm báo lỗi mạng.`;

async function test(prompt, name) {
  const messages = [
    { role: "system", content: prompt },
    { role: "user", content: "[NEW] [Eddy]: Chào Annie, em cho anh xem lịch thi đấu tứ kết world cup 2026 nhé" }
  ];

  try {
    const { data } = await axios.post(
      DEEPSEEK_URL,
      { model: DEEPSEEK_MODEL, messages },
      { headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` } }
    );
    console.log(`\n--- ${name} ---`);
    console.log("Response:\n" + data.choices[0].message.content);
    console.log("Prompt Tokens:", data.usage.prompt_tokens);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

async function run() {
  await test(oldPrompt, "OLD PROMPT");
  await test(newPrompt, "NEW PROMPT");
}
run();
