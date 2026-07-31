const admin = require("firebase-admin");
const fs = require("fs");

const serviceAccount = require("../functions/auth/line-ai-chatbot-eab18-firebase-adminsdk-fbsvc-2abdcc42a0.json");
const teleKey = require("../functions/auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json");

const appLine = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) }, "LINE_APP_UPDATE");
const dbLine = appLine.firestore();

const appTele = admin.initializeApp({ credential: admin.credential.cert(teleKey) }, "TELE_APP_UPDATE");
const dbTele = appTele.firestore();

async function run() {
  const result = {
    audit_keywords: [],
    missed_link_requests: [],
    missed_topics: [],
    missed_entities: [],
    missed_proactive_keywords: [],
    prompt_leakage: [],
    document_ids: {
      line: [],
      tele: []
    }
  };

  try {
    const processSnap = (snap, platform) => {
      snap.forEach(doc => {
        const data = doc.data();
        result.document_ids[platform].push(doc.id);
        if (data.audit_keywords) result.audit_keywords.push(...data.audit_keywords);
        if (data.missed_link_requests) result.missed_link_requests.push(...data.missed_link_requests);
        if (data.missed_topics) result.missed_topics.push(...data.missed_topics);
        if (data.missed_entities) result.missed_entities.push(...data.missed_entities);
        if (data.missed_proactive_keywords) result.missed_proactive_keywords.push(...data.missed_proactive_keywords);
        if (data.audit_issues) {
          const leakages = data.audit_issues.filter(i => i.issue_type === "prompt_leakage");
          if (leakages.length > 0) {
            result.prompt_leakage.push(...leakages.map(i => i.user_question));
          }
        }
      });
    };

    const snapLine = await dbLine.collection("audit_logs").get();
    processSnap(snapLine, "line");

    const snapTele = await dbTele.collection("audit_logs").get();
    processSnap(snapTele, "tele");

    fs.writeFileSync(__dirname + "/update_data.json", JSON.stringify(result, null, 2));
    console.log("Successfully fetched update data.");
  } catch (error) {
    console.error("Error fetching update data:", error);
  }
}

run();
