require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const { searchTavily } = require('./utils/tavily.js');

async function test() {
  const query = "lịch tứ kết năm 2026";
  console.log("Searching:", query);
  try {
    const r = await searchTavily(query);
    console.log("Result Length:", r.length);
    console.log("Raw Tavily Output:\n", r);
  } catch(e) {
    console.error("Err", e.message);
  }
}

test().catch(console.error);
