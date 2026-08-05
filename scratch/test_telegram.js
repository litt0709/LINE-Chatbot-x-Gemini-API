require('dotenv').config({ path: 'functions/.env.tele-ai-chatbot' });
const { generateDailyNewsDigest } = require('./functions/utils/news');
const telegram = require('./functions/utils/telegram');

async function test() {
  try {
    const newsDigest = await generateDailyNewsDigest('afternoon');
    console.log("----- RAW NEWS DIGEST -----");
    console.log(newsDigest);
    console.log("---------------------------");

    // We simulate telegram.push logic but do not actually send to avoid spam
    // Let's just run the regexes
    let rawText = newsDigest.replace(/<Task[^>]*>/gi, "").replace(/<\/Task>/gi, "")
                   .replace(/\[TAGS:.*?\]/gi, "")
                   .replace(/<PROFILE[^>]*>|<\/PROFILE>/gi, "")
                   .replace(/<FACT[^>]*>|<\/FACT>/gi, "")
                   .replace(/<REACT[^>]*>/gi, "").trim();

    let safeText = rawText.replace(/<br\s*\/?>/gi, "\n");
    safeText = safeText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safeText = safeText.replace(/&lt;a href="([^"]+)"&gt;(.*?)&lt;\/a&gt;/gi, '<a href="$1">$2</a>');

    const chunks = [safeText]; // Assume < 2000 chars for testing

    for (let chunk of chunks) {
      let htmlText = chunk.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
      htmlText = htmlText.replace(/```([\s\S]*?)```/g, "<pre>$1</pre>");
      htmlText = htmlText.replace(/`([^`]+)`/g, "<code>$1</code>");
      
      console.log("----- HTML TEXT FOR TELEGRAM -----");
      console.log(htmlText);
      
      // Let's check for any unescaped < or > that might break Telegram HTML
      // Telegram only allows <b>, <i>, <u>, <s>, <a>, <code>, <pre>
      // We will print any tags found
      const tags = htmlText.match(/<[^>]+>/g);
      console.log("----- TAGS FOUND -----", tags);
    }
  } catch (err) {
    console.error(err);
  }
}
test();
