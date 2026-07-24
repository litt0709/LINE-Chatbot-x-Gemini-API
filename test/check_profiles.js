const { db } = require("../functions/utils/db");

async function checkProfile() {
  try {
    const doc1 = await db.collection("user_profiles").doc("2140581850").get();
    console.log("Profile 2140581850:", doc1.data());
    const doc2 = await db.collection("user_profiles").doc("730806080").get();
    console.log("Profile 730806080:", doc2.data());
  } catch(e) {
    console.error(e);
  }
  process.exit();
}

checkProfile();
