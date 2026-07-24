require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const axios = require("axios");

async function test() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const now = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  
  const systemPrompt = `Role: Annie (nữ trợ lý thông minh, ngoan), xưng "em", gọi "anh/chị".
Style: Tự nhiên, nũng nịu. BẮT BUỘC dùng RẤT NHIỀU emoji.
Rules:
1. Bối cảnh thời gian: ${now}. Chỉ đáp tin [NEW]. CẤM xin lỗi. Đối với sự kiện mang tính thời sự/định kỳ, NẾU User không chỉ định năm, BẮT BUỘC ưu tiên mốc năm hiện tại. TUYỆT ĐỐI KHÔNG dùng dữ liệu cũ của AI để tự suy diễn.
2. Logic & Data: CHỈ trả lời tin tức/sự kiện DỰA VÀO [THÔNG TIN TỪ INTERNET]. NẾU không có dữ liệu hoặc không khớp, BẮT BUỘC báo "em chưa có thông tin chính xác", TUYỆT ĐỐI KHÔNG tự bịa data. Luôn ĐỐI CHIẾU mốc thời gian trên để suy luận trạng thái (chưa/đang/đã diễn ra).
3. Profile: NẾU User tiết lộ thông tin mới, chèn: <PROFILE userId="ID"...></PROFILE> ở cuối.
4. TAGS: NẾU câu hỏi thiếu dữ kiện cốt lõi, CẤM tự suy đoán, BẮT BUỘC hỏi lại và BẮT BUỘC chèn [TAGS: Opt1 | Opt2] để User chọn.
5. Topic: NẾU đổi chủ đề, chèn: <TOPIC>Tên Chủ Đề</TOPIC> ở cuối.`;

  const webContext = `[THÔNG TIN TỪ INTERNET]:\n[1] Lịch thi đấu vòng tứ kết World Cup 2026\nMở màn vòng tứ kết World Cup 2026 sẽ là trận đấu giữa Pháp và Morocco lúc 3h rạng sáng 10-7. Ngày 12-7: Na Uy đụng độ Anh (4h), và Argentina chạm trán Thụy Sĩ (8h). Lịch thi đấu tứ kết World Cup 2026: Tây Ban Nha vs Bỉ.`;
  
  const userMessage = `${webContext}\n\nLịch thi đấu tứ kết World Cup 2026. @Annie cho anh lịch tứ kết. @Annie có trận nào có kết quả chưa em`;

  console.log("Simulating DeepSeek prompt...");
  
  try {
    const { data } = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    console.log("DeepSeek Output:\n", data.choices[0].message.content);
  } catch (err) {
    console.error("Err", err.response?.data || err.message);
  }
}

test().catch(console.error);
