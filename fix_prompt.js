const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

// Add rule instruction
const actionTagsAnchor = "- Định danh <PROFILE userId=\"...\" real_name=\"...\" gender=\"male/female\" />.";
const newRuleInst = "\n     - Tự động Phản tỉnh (Self-Reflection): NẾU user chỉnh đốn, dạy dỗ cách xưng hô/tính cách/luật lệ, BẮT BUỘC lưu lại bằng <RULE action=\"ADD\" rule=\"...\" />.";
content = content.replace(actionTagsAnchor, actionTagsAnchor + newRuleInst);

// Add reading rules from sessionData
const sessionDataAnchor = "if (sessionData.Core_Memory) {";
const rulesReadLogic = `
      if (sessionData.rules && sessionData.rules.length > 0) {
        coreMemoryText += "\\n[LUẬT ĐƯỢC USER DẠY (BẮT BUỘC TUÂN THỦ)]:\\n- " + sessionData.rules.join("\\n- ") + "\\n";
      }
`;
content = content.replace(sessionDataAnchor, rulesReadLogic + "\n      " + sessionDataAnchor);

fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
console.log("DeepSeek prompt and rule reading updated.");
