const fs = require("fs");
let content = fs.readFileSync("functions/utils/deepseek.js", "utf8");

// We need to replace the axios.post block for API calling.
const startStr = "  // 4. Gọi DeepSeek API";
const endStr = "const { multimodal, analyzeDocument, summarizeHistory } = require(\"./gemini\");";

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx > -1 && endIdx > -1) {
    const newBlock = `  // 4. Gọi DeepSeek API với Tool Calling (Budget-Constrained ReAct)
  const tools = [
    {
      type: "function",
      function: {
        name: "google_search",
        description: "Tìm kiếm thông tin trên Internet. Chỉ dùng khi câu hỏi về thời sự, kiến thức cần độ chính xác cao hoặc bạn thiếu dữ liệu.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Câu truy vấn tìm kiếm ngắn gọn, ví dụ: 'giá vàng sjc hôm nay', 'bầu cử mỹ 2024'"
            }
          },
          required: ["query"]
        }
      }
    }
  ];

  let searchCount = 0;
  const MAX_SEARCH_CALLS = 2; // Hard Limit 2 calls
  let replyText = "";
  
  try {
    while (true) {
      const payload = { model: DEEPSEEK_MODEL, messages };
      
      // Chỉ gắn tools nếu chưa quá giới hạn và không phải là xin link (fast path heuristic)
      if (searchCount < MAX_SEARCH_CALLS && !isPreOptimized && !isStandaloneTopic) {
        payload.tools = tools;
      }
      
      const { data } = await axios.post(
        DEEPSEEK_URL,
        payload,
        { headers: { "Content-Type": "application/json", Authorization: \`Bearer \${DEEPSEEK_API_KEY}\` } }
      );
      
      const responseMessage = data.choices[0].message;
      
      // Nếu có gọi tool
      if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
        // Append model's tool call message
        messages.push(responseMessage);
        
        for (const toolCall of responseMessage.tool_calls) {
          if (toolCall.function.name === "google_search") {
            searchCount++;
            let searchResult = "Em tìm không thấy.";
            try {
              const args = JSON.parse(toolCall.function.arguments);
              console.log(\`[DeepSeek Tool] LLM gọi search_web lần \${searchCount} với query: "\${args.query}"\`);
              
              const res = await resolveWebContext(args.query, true, sessionId);
              if (res && res.context) {
                 searchResult = res.context;
                 if (res.urls && res.urls.length > 0) {
                    require("./db").rtdb.ref(\`chats/\${sessionId}/metadata/last_links\`).set(res.urls).catch(() => {});
                 }
              }
            } catch (err) {
              console.error("[DeepSeek Tool] Lỗi parse hoặc gọi search:", err.message);
            }
            
            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: searchResult
            });
          }
        }
        // Gọi lại LLM với kết quả
        continue;
      }
      
      // Nếu không gọi tool, đó là câu trả lời cuối cùng
      replyText = responseMessage.content;
      break; // Thoát vòng lặp
    }

    if (isTimeRangeSummaryRequest(prompt) || /tóm tắt|summary/i.test(cleanPrompt)) {
       replyText = replyText.replace(/[^.!?]+\\?\\s*$/, "").trim();
    }

    console.log(\`[DeepSeek] Phản hồi từ LLM (với \${searchCount} lần search): "\${replyText}"\`);
    return replyText;
  } catch (error) {
    console.error("[DeepSeek] API Error:", error?.response?.data || error.message);
    throw error;
  }
};

`;
    content = content.substring(0, startIdx) + newBlock + content.substring(endIdx);
    fs.writeFileSync("functions/utils/deepseek.js", content, "utf8");
    console.log("DeepSeek Tool Calling updated.");
} else {
    console.log("Failed to find block");
}
