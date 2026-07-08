require("dotenv").config();
const { generateDailyNewsDigest } = require("./utils/news");

(async () => {
  console.log("Generating news...");
  const text = await generateDailyNewsDigest();
  console.log("=========================================");
  console.log(text);
  console.log("=========================================");
})();
