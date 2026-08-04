const { generateDeepSeekResponse } = require("./utils/deepseek");
// Try to call with an empty history
generateDeepSeekResponse("hôm nay có tin gì mới không?", "", "", "test1", {}, {}, null, false, "", false)
  .then(console.log)
  .catch(console.error);
