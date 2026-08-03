const fs = require("fs");
let content = fs.readFileSync("functions/index.js", "utf8");

content = content.replace("rules.push(ruleContent);", "rules.push(ruleContent);\n           if (rules.length > 20) rules = rules.slice(rules.length - 20); // Giới hạn 20 luật để không phình to DB");

fs.writeFileSync("functions/index.js", content, "utf8");
console.log("Rules capped.");
