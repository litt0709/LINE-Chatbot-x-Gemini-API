const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env.tele-ai-chatbot") });

const gemini = require("../utils/gemini");
const deepseek = require("../utils/deepseek");

async function test() {
  console.log("=== Testing Telegram LLM Config ===");
  console.log("API_KEY:", process.env.API_KEY ? process.env.API_KEY.substring(0, 10) + "..." : "NONE");
  console.log("DEEPSEEK_API_KEY:", process.env.DEEPSEEK_API_KEY ? process.env.DEEPSEEK_API_KEY.substring(0, 10) + "..." : "NONE");
  console.log("DATABASE_URL:", process.env.DATABASE_URL);

  console.log("\n1. Testing DeepSeek Chat directly...");
  try {
    const res = await deepseek.chat("2140581850", "Chào em", "Lâm", "2140581850");
    console.log("DeepSeek reply:", res);
  } catch (e) {
    console.error("DeepSeek chat error:", e.message, e.stack);
  }

  process.exit(0);
}

test();
