const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "../functions/serviceAccountKey.json"));
if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://line-ai-chatbot-eab18-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const db = admin.firestore();
const rtdb = admin.database();

async function check() {
  console.log("=== GLOBAL FACTS (RTDB) ===");
  const globalFacts = await rtdb.ref("facts/global/detail").once("value");
  const globalIndex = await rtdb.ref("facts/global/index").once("value");
  
  if (globalFacts.exists()) {
    const facts = globalFacts.val();
    const indices = globalIndex.exists() ? globalIndex.val() : {};
    for (const [id, fact] of Object.entries(facts)) {
      const idx = indices[id] || {};
      console.log(`- Fact ID: ${id}`);
      console.log(`  Topic: ${idx.topic}`);
      console.log(`  Keywords: ${idx.keywords?.join(", ")}`);
      console.log(`  Content: ${fact.content}`);
    }
  } else {
    console.log("No global facts found.");
  }
  
  console.log("\n=== USER FACTS (RTDB) ===");
  const userFacts = await rtdb.ref("facts/users").once("value");
  if (userFacts.exists()) {
    const users = userFacts.val();
    for (const [userId, userData] of Object.entries(users)) {
      const details = userData.detail || {};
      const indices = userData.index || {};
      console.log(`User/Group ID: ${userId}`);
      for (const [id, fact] of Object.entries(details)) {
         const idx = indices[id] || {};
         console.log(`  - Fact ID: ${id}, Topic: ${idx.topic}, Content: ${fact.content}`);
      }
    }
  } else {
    console.log("No user facts found.");
  }
  
  console.log("\n=== USER RULES (Self-Reflection, Firestore) ===");
  const usersRef = await db.collection("users").get();
  let hasRules = false;
  usersRef.forEach(doc => {
    const data = doc.data();
    if (data.rules && data.rules.length > 0) {
      hasRules = true;
      console.log(`User/Group ID: ${doc.id}`);
      data.rules.forEach((rule, i) => {
        console.log(`  ${i+1}. ${rule}`);
      });
    }
    if (data.Core_Memory) {
        console.log(`  [Core Memory]: ${data.Core_Memory}`);
    }
  });
  if (!hasRules) console.log("No user rules found.");

  console.log("\n=== SYSTEM CONFIGS (Firestore) ===");
  const configDoc = await db.collection("system_configs").doc("bot_config").get();
  if (configDoc.exists) {
    const data = configDoc.data();
    console.log("human_insights:", data.human_insights || []);
    console.log("dynamic_guardrails:", data.dynamic_guardrails || []);
  } else {
    console.log("No system configs found.");
  }

  process.exit(0);
}

check().catch(console.error);
