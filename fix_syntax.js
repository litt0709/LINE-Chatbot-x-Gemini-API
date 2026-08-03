const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

content = content.replace("  } catch (err) {\n    console.error(\"[DeepSeek] resolveWebContext lỗi:\", err.message);\n  }", "");
fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
console.log("Syntax fixed.");
