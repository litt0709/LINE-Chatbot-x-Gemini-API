const fs = require("fs");
let content = fs.readFileSync("functions/index.js", "utf8");

const injectionStr = `
  // Bắt tag <RULE> (Phase 4: Self-Reflection)
  const ruleRegex = /<RULE\\s+([^>]*)\\/?>(.*?)<\\/RULE>|<RULE\\s+([^>]*)\\/?>(.*?)$|<RULE\\s+([^>]*)\\/>/gi;
  let ruleMatch;
  while ((ruleMatch = ruleRegex.exec(text)) !== null) {
    const attrStr = ruleMatch[1] || ruleMatch[3] || ruleMatch[5] || "";
    const getAttr = (name) => {
      const r = new RegExp(\`\${name}=["']([^"']*)["']\`, "i");
      const m = attrStr.match(r);
      return m ? m[1] : null;
    };
    const action = (getAttr("action") || "").toUpperCase();
    let ruleContent = getAttr("rule") || ruleMatch[2] || ruleMatch[4] || "";
    ruleContent = ruleContent.trim();
    
    if (action === "ADD" && ruleContent) {
      cleanedText = cleanedText.replace(ruleMatch[0], "");
      try {
        const sessionRef = db.collection("users").doc(sessionId || senderId);
        const sessionDoc = await sessionRef.get();
        let rules = [];
        if (sessionDoc.exists) {
           const data = sessionDoc.data();
           rules = data.rules || [];
        }
        if (!rules.includes(ruleContent)) {
           rules.push(ruleContent);
           await sessionRef.set({ rules: rules }, { merge: true });
           console.log(\`[Self-Reflection] Đã thêm luật mới: \${ruleContent}\`);
        }
      } catch (e) {
        console.error("[Self-Reflection] Lỗi lưu rule:", e.message);
      }
    }
  }
`;

const insertPoint = "  return { text: cleanedText, topic, reaction };";
content = content.replace(insertPoint, injectionStr + "\n" + insertPoint);

fs.writeFileSync("functions/index.js", content, "utf8");
console.log("Rule extraction injected.");
