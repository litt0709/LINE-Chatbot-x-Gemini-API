process.env.PLATFORM = "TELEGRAM";
process.env.FIREBASE_CONFIG = "{}"; // mock
const { handleReportCommand } = require("./functions/commands/report.js");
const admin = require("firebase-admin");

// Mock admin
admin.initializeApp = () => {};
admin.credential = { cert: () => {} };
admin.database = () => ({
  ref: () => ({
    once: async () => ({
      exists: () => true,
      val: () => ({})
    })
  })
});
admin.apps = [{}];

(async () => {
  try {
    const res = await handleReportCommand("/report", { platform: "TELEGRAM" });
    console.log("RESULT:\n", res);
  } catch(e) {
    console.error("ERROR:\n", e);
  }
})();
