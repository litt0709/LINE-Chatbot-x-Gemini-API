require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const { searchTavily } = require('./utils/tavily.js');

async function test() {
  const q1 = "lịch tứ kết World Cup 2026 năm 2026";
  console.log("Searching:", q1);
  try {
    const r1 = await searchTavily(q1);
    console.log("R1:", r1.substring(0, 500));
  } catch(e) { console.error("Err 1", e.message); }

  const q2 = "trận Tây Ban Nha vs Bỉ World Cup 2026";
  console.log("\nSearching:", q2);
  try {
    const r2 = await searchTavily(q2);
    console.log("R2:", r2.substring(0, 500));
  } catch(e) { console.error("Err 2", e.message); }
}

test().catch(console.error);
