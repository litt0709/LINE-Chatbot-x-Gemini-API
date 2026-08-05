require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const deepseek = require('./utils/deepseek');
(async () => {
  try {
    console.log("Calling deepseek...");
    const res = await deepseek.chat("-1003832428084", "hãy kiểm tra log tele group DCL", "Admin", "2140581850", null, "", false, "", true);
    console.log("SUCCESS:", res);
  } catch (e) {
    console.error("ERROR:", e.message);
  }
})();
