require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const { searchTavily } = require("./utils/tavily");

(async () => {
  const query = "World Cup 2026. mai có trận nào không, làm kèo coi";
  console.log("Searching for:", query);
  const result = await searchTavily(query, false);
  console.log("Result:", result);
})();
