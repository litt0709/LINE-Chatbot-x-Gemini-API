const { handleCommand } = require("./functions/commands/index.js");
(async () => {
  try {
    const res = await handleCommand("/report", { platform: "TELEGRAM" });
    console.log("RESULT:\n" + res);
  } catch(e) {
    console.error("ERROR:", e);
  }
})();
