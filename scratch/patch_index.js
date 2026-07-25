const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../functions/index.js');
let code = fs.readFileSync(file, 'utf8');

// Telegram Logic

// 1. Target logic
code = code.replace(
  `let isImplicitlyTargeted = !isDirectlyTargeted && messageContent && /\\bannie\\b/i.test(messageContent);\n\n    const shouldProcessMedia = chatType === "private" || isDirectlyTargeted || isImplicitlyTargeted;`,
  `let isImplicitlyTargeted = !isDirectlyTargeted && messageContent && /\\bannie\\b/i.test(messageContent);
    let isProactiveTargeted = false;

    // --- Smart Group Chat: Focus Mode ---
    if (chatType !== "private" && !isDirectlyTargeted && !isImplicitlyTargeted) {
      const focus = focusModeCache.get(String(chatId));
      if (focus && focus.userId === String(userId) && Date.now() < focus.expiresAt) {
        const hasOtherMentions = /@\\w+\\b/gi.test(messageContent) && !messageContent.toLowerCase().includes(\`@\${botUsername}\`);
        if (!hasOtherMentions) {
          isImplicitlyTargeted = true;
          console.log(\`[Focus Mode] Telegram: Bot tự động follow up với User \${userId} trong Group \${chatId}\`);
        }
      }
    }

    // --- Smart Group Chat: Proactive Intervention ---
    if (chatType !== "private" && !isDirectlyTargeted && !isImplicitlyTargeted && messageContent) {
      const triggerWords = ["ai biết", "làm sao", "lỗi gì", "bug", "không chạy", "có cách nào", "bác nào", "mọi người", "xin ý kiến", "chịu"];
      const hasTrigger = messageContent.length > 10 && triggerWords.some(w => messageContent.toLowerCase().includes(w));
      if (hasTrigger) {
        const nextAllowed = proactiveRateLimitCache.get(String(chatId)) || 0;
        if (Date.now() >= nextAllowed) {
          isProactiveTargeted = true;
          console.log(\`[Proactive] Telegram: Triggered in Group \${chatId}\`);
        }
      }
    }

    const shouldProcessMedia = chatType === "private" || isDirectlyTargeted || isImplicitlyTargeted || isProactiveTargeted;`
);

// 2. Drop logic
code = code.replace(
  `    if (chatType !== "private") {
      if (!isDirectlyTargeted && !isImplicitlyTargeted) {`,
  `    if (chatType !== "private") {
      if (!isDirectlyTargeted && !isImplicitlyTargeted && !isProactiveTargeted) {`
);

// 3. llm.chat call
code = code.replace(
  `const rawMsg = await llm.chat(String(chatId), cleanPrompt, senderName, userId, null, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext, factsContext);`,
  `const rawMsg = await llm.chat(String(chatId), cleanPrompt, senderName, userId, null, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext, factsContext, isProactiveTargeted);`
);

// 4. Update Cache
code = code.replace(
  `const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
    await appendRawMessage(String(chatId), userMsgData, botMsgData);

    return res.end();`,
  `const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
    await appendRawMessage(String(chatId), userMsgData, botMsgData);

    if (chatType !== "private") {
      focusModeCache.set(String(chatId), { userId: String(userId), expiresAt: Date.now() + 3 * 60 * 1000 });
      if (isProactiveTargeted) {
        proactiveRateLimitCache.set(String(chatId), Date.now() + 60 * 60 * 1000);
      }
    }

    return res.end();`
);


// LINE Logic

// 1. Target logic
code = code.replace(
  `    let isImplicitlyTargeted = false;
    if (event.message.type === "text") {
      const textLower = event.message.text.toLowerCase();
      if (textLower.includes("@annie") || textLower.includes("@snowannie")) {
        isDirectlyTargeted = true;
      } else if (/\\bannie\\b/i.test(textLower)) {
        isImplicitlyTargeted = true;
      }
    }`,
  `    let isImplicitlyTargeted = false;
    let isProactiveTargeted = false;
    if (event.message.type === "text") {
      const textLower = event.message.text.toLowerCase();
      if (textLower.includes("@annie") || textLower.includes("@snowannie")) {
        isDirectlyTargeted = true;
      } else if (/\\bannie\\b/i.test(textLower)) {
        isImplicitlyTargeted = true;
      }

      // --- Smart Group Chat: Focus Mode ---
      if (isGroup && !isDirectlyTargeted && !isImplicitlyTargeted) {
        const focus = focusModeCache.get(String(chatId));
        if (focus && focus.userId === String(userId) && Date.now() < focus.expiresAt) {
          const hasOtherMentions = /@\\w+\\b/gi.test(event.message.text) && !textLower.includes("@annie") && !textLower.includes("@snowannie");
          if (!hasOtherMentions) {
            isImplicitlyTargeted = true;
            console.log(\`[Focus Mode] LINE: Bot tự động follow up với User \${userId} trong Group \${chatId}\`);
          }
        }
      }

      // --- Smart Group Chat: Proactive Intervention ---
      if (isGroup && !isDirectlyTargeted && !isImplicitlyTargeted) {
        const triggerWords = ["ai biết", "làm sao", "lỗi gì", "bug", "không chạy", "có cách nào", "bác nào", "mọi người", "xin ý kiến", "chịu"];
        const hasTrigger = event.message.text.length > 10 && triggerWords.some(w => textLower.includes(w));
        if (hasTrigger) {
          const nextAllowed = proactiveRateLimitCache.get(String(chatId)) || 0;
          if (Date.now() >= nextAllowed) {
            isProactiveTargeted = true;
            console.log(\`[Proactive] LINE: Triggered in Group \${chatId}\`);
          }
        }
      }
    }`
);

// 2. Drop logic
code = code.replace(
  `    if (isGroup) {
      if (!isDirectlyTargeted && !isImplicitlyTargeted) {`,
  `    if (isGroup) {
      if (!isDirectlyTargeted && !isImplicitlyTargeted && !isProactiveTargeted) {`
);
code = code.replace(
  `} else if (isDirectlyTargeted || isImplicitlyTargeted) {`,
  `} else if (isDirectlyTargeted || isImplicitlyTargeted || isProactiveTargeted) {`
);

// 3. llm.chat call
code = code.replace(
  `const rawMsg = await llm.chat(String(chatId), promptText, senderName, userId, lineMessageId, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext, factsContext);`,
  `const rawMsg = await llm.chat(String(chatId), promptText, senderName, userId, lineMessageId, quoteContext, forceIgnoreCheck, groupContext, isGroup, hotTopic, isPostback, postbackContext, factsContext, isProactiveTargeted);`
);

// 4. Update Cache
code = code.replace(
  `const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
    await appendRawMessage(String(chatId), userMsgData, botMsgData);
  } catch (err) {`,
  `const botMsgData = { role: "model", text: botMsgText, createdAt: new Date().toISOString() };
    await appendRawMessage(String(chatId), userMsgData, botMsgData);

    if (isGroup) {
      focusModeCache.set(String(chatId), { userId: String(userId), expiresAt: Date.now() + 3 * 60 * 1000 });
      if (isProactiveTargeted) {
        proactiveRateLimitCache.set(String(chatId), Date.now() + 60 * 60 * 1000);
      }
    }
  } catch (err) {`
);

fs.writeFileSync(file, code);
console.log("Patched index.js");
