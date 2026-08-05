require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const deepseek = require('./utils/deepseek');

(async () => {
  try {
    const res = await deepseek.chat("test-session", "xin chào, bạn tên gì?");
    console.log("Success:", res);
  } catch (e) {
    console.error("Error:", e.message);
  }
})();
