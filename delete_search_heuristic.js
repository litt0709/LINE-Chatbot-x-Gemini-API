const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

const startStr = '    let contextualSearchPrompt = searchPrompt;';
const endStr = '    // 3. Build message list';

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx > -1 && endIdx > -1) {
    content = content.substring(0, startIdx) + content.substring(endIdx);
    fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
    console.log("Deleted heuristic search logic.");
} else {
    console.log("Could not find heuristic search logic");
}
