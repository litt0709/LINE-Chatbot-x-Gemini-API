const fs = require("fs");
const lines = fs.readFileSync("functions/utils/deepseek.js", "utf8").split("\n");
const newLines = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("let contextualSearchPrompt")) {
        skip = true;
    }
    if (line.includes("// 3. Build message list")) {
        skip = false;
    }
    if (!skip) {
        newLines.push(line);
    }
}
fs.writeFileSync("functions/utils/deepseek.js", newLines.join("\n"), "utf8");
console.log("Deleted heuristic search logic.");
