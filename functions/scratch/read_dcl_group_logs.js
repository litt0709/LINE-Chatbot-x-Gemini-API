const admin = require("firebase-admin");
const path = require("path");

const teleKey = require(path.join(__dirname, "../auth/tele-ai-chatbot-firebase-adminsdk-fbsvc-f017990579.json"));
const appTele = admin.initializeApp({
  credential: admin.credential.cert(teleKey),
  databaseURL: "https://tele-ai-chatbot-default-rtdb.asia-southeast1.firebasedatabase.app"
}, "DCL_USERS");

const db = appTele.firestore();
const rtdb = appTele.database();

async function run() {
  const GROUP_ID = "-1003832428084";
  
  // 1. Xem users collection (lưu conversation history)
  console.log("=== Firestore 'users' collection ===");
  const usersSnap = await db.collection("users").get();
  console.log(`Total users docs: ${usersSnap.size}`);
  usersSnap.forEach(doc => {
    const d = doc.data();
    const preview = JSON.stringify(d).substring(0, 150);
    console.log(`  Doc: ${doc.id} | ${preview}`);
  });

  // 2. Xem doc cho nhóm DCL
  console.log(`\n=== Firestore 'users/${GROUP_ID}' ===`);
  const groupDoc = await db.collection("users").doc(GROUP_ID).get();
  if (groupDoc.exists) {
    const d = groupDoc.data();
    console.log("Data:", JSON.stringify(d, null, 2).substring(0, 2000));
    
    // Xem sub-collections
    const subCols = await db.collection("users").doc(GROUP_ID).listCollections();
    console.log("Sub-collections:", subCols.map(c => c.id));
    
    for (const col of subCols) {
      const subSnap = await col.orderBy("createdAt", "desc").limit(10).get();
      console.log(`\n  Sub-collection: ${col.id} (${subSnap.size} docs)`);
      subSnap.forEach(doc => {
        const d = doc.data();
        console.log(`    [${d.createdAt}] [${d.role}] [${d.senderName}]: ${d.text?.substring(0, 100)}`);
      });
    }
  } else {
    console.log("Không có document này");
  }

  // 3. Check active_sessions trong RTDB
  console.log("\n=== RTDB active_sessions ===");
  const asSnap = await rtdb.ref("active_sessions").once("value");
  if (asSnap.exists()) {
    console.log(JSON.stringify(asSnap.val(), null, 2));
  } else {
    console.log("Không có active_sessions");
  }

  // 4. Xem Firestore user_profiles
  console.log("\n=== Firestore user_profiles (sample 5) ===");
  const upSnap = await db.collection("user_profiles").limit(5).get();
  upSnap.forEach(doc => {
    console.log(`  ${doc.id}: ${JSON.stringify(doc.data()).substring(0, 150)}`);
  });

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
