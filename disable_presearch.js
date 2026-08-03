const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

// Comment out the old resolveWebContext logic
content = content.replace(
    "const searchResult = await resolveWebContext(contextualSearchPrompt, isPreOptimized, sessionId);",
    "/* DISABLED FOR ReAct:\n    const searchResult = await resolveWebContext(contextualSearchPrompt, isPreOptimized, sessionId);"
);

content = content.replace(
    "require(\"./db\").rtdb.ref(`chats/${sessionId}/metadata/last_links`).set(searchResult.urls).catch(() => { });\n    }",
    "require(\"./db\").rtdb.ref(`chats/${sessionId}/metadata/last_links`).set(searchResult.urls).catch(() => { });\n    }\n    */"
);

fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
console.log("Pre-search disabled.");
