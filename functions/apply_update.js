const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("./auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP_UPDATE");
const db = appLine.firestore();

async function run() {
  const data = JSON.parse(fs.readFileSync(__dirname + "/update_data.json", "utf8"));
  let botConfig = data.bot_config || {};
  let updatedSomething = false;
  
  if (!botConfig.search_keywords) botConfig.search_keywords = {};
  if (!botConfig.standalone_topics) botConfig.standalone_topics = [];
  if (!botConfig.proactive_trigger_words) botConfig.proactive_trigger_words = [];
  if (!botConfig.leak_blacklist) botConfig.leak_blacklist = [];
  if (!botConfig.link_requests_regex) botConfig.link_requests_regex = "";
  
  const addedKeywords = [];
  if (data.audit_keywords) {
    data.audit_keywords.forEach(kw => {
       let cat = kw.suggested_category || "GENERAL";
       if (cat.includes("/")) cat = cat.split("/")[0];
       if (!botConfig.search_keywords[cat]) botConfig.search_keywords[cat] = "";
       const lowerWord = kw.word.toLowerCase();
       // Check if already exists (as a word)
       const regex = new RegExp(`(^|\\|)${lowerWord}(\\||$)`);
       if (!regex.test(botConfig.search_keywords[cat])) {
           botConfig.search_keywords[cat] = botConfig.search_keywords[cat] ? botConfig.search_keywords[cat] + "|" + lowerWord : lowerWord;
           addedKeywords.push(lowerWord);
           updatedSomething = true;
       }
    });
  }

  const addedTopics = [];
  if (data.missed_topics) {
    data.missed_topics.forEach(t => {
       const lowerT = t.toLowerCase();
       if (!botConfig.standalone_topics.includes(lowerT)) {
           botConfig.standalone_topics.push(lowerT);
           addedTopics.push(lowerT);
           updatedSomething = true;
       }
    });
  }

  const addedProactive = [];
  if (data.missed_proactive_keywords) {
    data.missed_proactive_keywords.forEach(p => {
       const lowerP = p.toLowerCase();
       if (!botConfig.proactive_trigger_words.includes(lowerP)) {
           botConfig.proactive_trigger_words.push(lowerP);
           addedProactive.push(lowerP);
           updatedSomething = true;
       }
    });
  }

  if (updatedSomething) {
      botConfig.updated_at = admin.firestore.FieldValue.serverTimestamp();
      await db.collection("system_configs").doc("bot_config").set(botConfig, {merge: true});
      console.log("Successfully updated bot_config on Firestore.");
      console.log("Added Keywords:", addedKeywords.join(", "));
      console.log("Added Topics:", addedTopics.join(", "));
      console.log("Added Proactive:", addedProactive.join(", "));
  } else {
      console.log("No new updates for bot_config.");
  }
}
run();
