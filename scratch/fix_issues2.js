const fs = require('fs');
const path = require('path');

// --- 1. Fix index.js (Move Video/Audio Check) ---
let indexJs = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');

// For Telegram
// We will remove the video/audio check block from line 828-831 and insert it after `const shouldProcessMedia`
const tgVideoCheckRegex = /[\t ]*\/\/ \[COST MINIMIZATION\] Block direct video\/audio processing requests offline\n[\t ]*if \(messageContent && \/\(lấy text\|tổng hợp\|tóm tắt\|trích xuất\|xử lý\|đọc\)\.\*\?\\b\(video\|audio\|âm thanh\|mp4\|mp3\|youtube\)\\b\|\\b\(video\|audio\|âm thanh\|mp4\|mp3\|youtube\)\\b\.\*\?\(lấy text\|tổng hợp\|tóm tắt\|trích xuất\|xử lý\|đọc\)\/i\.test\(messageContent\)\) \{\n[\t ]*await telegram\.reply\(chatId, "Dạ hiện tại em chưa hỗ trợ tính năng trích xuất nội dung trực tiếp từ Video\/Audio ạ\. 😅"\);\n[\t ]*return res\.end\(\);\n[\t ]*\}\n/g;

indexJs = indexJs.replace(tgVideoCheckRegex, '');

// Now insert it after shouldProcessMedia
const tgTarget = `const shouldProcessMedia = chatType === "private" || isDirectlyTargeted || isImplicitlyTargeted || isProactiveTargeted;`;
const tgInsert = `
    // [COST MINIMIZATION] Block direct video/audio processing requests offline
    if (shouldProcessMedia && messageContent && /(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc).*?\\b(video|audio|âm thanh|mp4|mp3|youtube)\\b|\\b(video|audio|âm thanh|mp4|mp3|youtube)\\b.*?(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc)/i.test(messageContent)) {
      await telegram.reply(chatId, "Dạ hiện tại em chưa hỗ trợ tính năng trích xuất nội dung trực tiếp từ Video/Audio ạ. 😅");
      return res.end();
    }
`;
indexJs = indexJs.replace(tgTarget, tgTarget + tgInsert);


// For LINE
const lineVideoCheckRegex = /[\t ]*\/\/ \[COST MINIMIZATION\] Block direct video\/audio processing requests offline\n[\t ]*if \(\/\(lấy text\|tổng hợp\|tóm tắt\|trích xuất\|xử lý\|đọc\)\.\*\?\\b\(video\|audio\|âm thanh\|mp4\|mp3\|youtube\)\\b\|\\b\(video\|audio\|âm thanh\|mp4\|mp3\|youtube\)\\b\.\*\?\(lấy text\|tổng hợp\|tóm tắt\|trích xuất\|xử lý\|đọc\)\/i\.test\(messageContent\)\) \{\n[\t ]*await line\.replyMessage\(event\.replyToken, \[\{ type: "text", text: "Dạ hiện tại em chưa hỗ trợ tính năng trích xuất nội dung trực tiếp từ Video\/Audio ạ\. 😅" \}\]\);\n[\t ]*continue;\n[\t ]*\}\n/g;

indexJs = indexJs.replace(lineVideoCheckRegex, '');

// Insert it inside shouldProcessMedia/shouldRespond logic in LINE
// LINE doesn't have a single `shouldProcessMedia` variable in the same way, but it calculates `isDirectlyTargeted` etc.
// Let's insert it after:
// if (!isDirectlyTargeted && !isImplicitlyTargeted) { ... appendRawMessage ... }
// Wait, the easiest way is to add a shouldRespond variable:
const lineTarget = `      let isDirectlyTargeted = false;
      let isImplicitlyTargeted = false;`;

// Actually, let's insert it right after the block where targeting is determined and before LLM chat.
// Let's find: `if (!isImage && cleanText(messageContent).toLowerCase() === "tóm tắt chủ đề") {`
// No, the targeting is determined further down.
// Let's find:
/*
        if (!isDirectlyTargeted && !isImplicitlyTargeted) {
          ...
          continue;
        }
*/
const lineInsertTarget = `        if (!isDirectlyTargeted && !isImplicitlyTargeted) {
          const profile = await line.getUserProfile(userId, sessionId);`;

const lineFix = `
      const shouldRespondLine = event.source.type === "user" || isDirectlyTargeted || isImplicitlyTargeted || isProactiveTargeted;
      if (shouldRespondLine && /(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc).*?\\b(video|audio|âm thanh|mp4|mp3|youtube)\\b|\\b(video|audio|âm thanh|mp4|mp3|youtube)\\b.*?(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc)/i.test(messageContent)) {
        await line.replyMessage(event.replyToken, [{ type: "text", text: "Dạ hiện tại em chưa hỗ trợ tính năng trích xuất nội dung trực tiếp từ Video/Audio ạ. 😅" }]);
        continue;
      }
`;
// Wait, isProactiveTargeted is calculated AFTER the isDirectlyTargeted check?
// Let's just insert the check before calling the chat API, e.g. before: `try { const replyMessage = await llm.chat(...)`
const lineChatCallTarget = `try {
        const replyMessage = await llm.chat(
          sessionId,`;

const lineVideoCheckFinal = `
        if (/(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc).*?\\b(video|audio|âm thanh|mp4|mp3|youtube)\\b|\\b(video|audio|âm thanh|mp4|mp3|youtube)\\b.*?(lấy text|tổng hợp|tóm tắt|trích xuất|xử lý|đọc)/i.test(messageContent)) {
          await line.replyMessage(event.replyToken, [{ type: "text", text: "Dạ hiện tại em chưa hỗ trợ tính năng trích xuất nội dung trực tiếp từ Video/Audio ạ. 😅" }]);
          continue;
        }

        `;
indexJs = indexJs.replace(lineChatCallTarget, lineVideoCheckFinal + lineChatCallTarget);

fs.writeFileSync(path.join(__dirname, '../functions/index.js'), indexJs);
console.log('Fixed index.js video check logic.');


// --- 2. Fix search.js (Add outage keywords) ---
let searchJs = fs.readFileSync(path.join(__dirname, '../functions/utils/search.js'), 'utf8');
const searchKwTarget = `"tin hot", "fact check", "kiểm chứng", "sự thật", "tin chuẩn", "tin thật",`;
const searchKwInsert = `"lỗi", "sập", "outage", "bảo trì", "không vào được", "lag", "disconnect",`;
searchJs = searchJs.replace(searchKwTarget, searchKwInsert + '\n  ' + searchKwTarget);
fs.writeFileSync(path.join(__dirname, '../functions/utils/search.js'), searchJs);
console.log('Fixed search.js keywords.');


// --- 3. Fix deepseek.js (Enhance Guardrail) ---
let deepseekJs = fs.readFileSync(path.join(__dirname, '../functions/utils/deepseek.js'), 'utf8');
const deepseekTarget = `if (/(tin tức|bài báo|vụ án|sự kiện|xã hội)/i.test(cleanPrompt) && !webContext) {
    guardrails += " [SYSTEM: CẤM tự ý kết luận sự kiện/tương lai nếu không có dữ liệu tìm kiếm (Web Context).]";
  }`;
const deepseekReplace = `if (/(tin tức|bài báo|vụ án|sự kiện|xã hội|lỗi|sập|outage|bảo trì)/i.test(cleanPrompt) && !webContext) {
    guardrails += " [SYSTEM: CẤM tự ý kết luận sự kiện/tương lai nếu không có dữ liệu tìm kiếm (Web Context). BẮT BUỘC trả lời KHÔNG BIẾT vì thiếu thông tin thời sự.]";
  }`;
deepseekJs = deepseekJs.replace(deepseekTarget, deepseekReplace);
fs.writeFileSync(path.join(__dirname, '../functions/utils/deepseek.js'), deepseekJs);
console.log('Fixed deepseek.js guardrail.');

