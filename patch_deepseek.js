const fs = require('fs');
const path = './functions/utils/deepseek.js';
let code = fs.readFileSync(path, 'utf8');

const targetStr = `const payload = { model: DEEPSEEK_MODEL, messages };`;
const patchStr = `
      // Bắt buộc sanitize payload để phòng tránh lỗi "unknown variant model"
      messages.forEach((m, idx) => {
        if (m.role === "model") {
          console.warn("[DeepSeek] CẢNH BÁO: Phát hiện role='model' ở index " + idx + ", tiến hành sanitize thành 'assistant'. Nội dung:", m.content);
          m.role = "assistant";
        }
      });
      const payload = { model: DEEPSEEK_MODEL, messages };`;

if (code.includes(targetStr) && !code.includes('CẢNH BÁO: Phát hiện role')) {
  code = code.replace(targetStr, patchStr);
  fs.writeFileSync(path, code);
  console.log("Patched successfully!");
} else {
  console.log("Could not patch or already patched.");
}
