require('dotenv').config({ path: '/Users/snow/Documents/www/LINE-Chatbot/functions/.env.line-ai-chatbot-eab18' });
const { tavily } = require("@tavily/core");

async function test() {
  const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
  
  const q2 = "trận Tây Ban Nha vs Bỉ sắp đá năm 2026";
  console.log("\nSearching:", q2);
  const r2 = await tvly.search(q2, { searchDepth: "basic", maxResults: 3 });
  console.log("R2:", JSON.stringify(r2.results, null, 2));
}

test().catch(console.error);
