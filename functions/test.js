const { chat } = require("./utils/deepseek");
chat("hôm nay có tin gì mới không?", "", "", "test1", {}, {}, null, false, "", false)
  .then(console.log)
  .catch(console.error);
