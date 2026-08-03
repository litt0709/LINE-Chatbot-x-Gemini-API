const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

content = content.replace("!isPreOptimized && !isStandaloneTopic", "!isStandaloneTopic");

fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
console.log("Variables fixed.");
