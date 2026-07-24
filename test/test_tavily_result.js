require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const { searchTavily } = require('./utils/tavily.js');

async function test() {
  const query = "Lịch thi đấu tứ kết World Cup 2026. lịch tứ kết. có trận nào có kết quả chưa em ngày 10/7/2026";
  console.log("Searching:", query);
  try {
    const r = await searchTavily(query);
    console.log("Result Length:", r ? r.length : 0);
    console.log("Raw Tavily Output:\n", r);
  } catch(e) {
    console.error("Err", e.message);
  }
}

test().catch(console.error);
