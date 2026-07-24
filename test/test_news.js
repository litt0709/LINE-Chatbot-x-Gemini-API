require("dotenv").config({ path: ".env.tele-ai-chatbot" });
const { generateDailyNewsDigest } = require("./utils/news");

(async () => {
  console.log("Generating news...");
  const text = await generateDailyNewsDigest();
  console.log("=========================================");
  console.log(text);
  console.log("=========================================");
})();
