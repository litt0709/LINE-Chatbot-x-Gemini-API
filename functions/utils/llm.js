/**
 * LLM Router — chọn đúng provider (DeepSeek hoặc Gemini) dựa vào biến môi trường LLM_PROVIDER.
 * index.js chỉ cần import module này, không cần biết provider cụ thể.
 */

const provider = (process.env.LLM_PROVIDER || "GEMINI").toUpperCase();

let llm;
if (provider === "DEEPSEEK") {
  llm = require("./deepseek");
} else {
  llm = require("./gemini");
}

module.exports = llm;
