require('dotenv').config({ path: 'functions/.env' });
const axios = require('axios');
(async () => {
  try {
    const res = await axios.post("https://api.deepseek.com/chat/completions", {
      model: "deepseek-chat", // standard model
      messages: [{role: "user", content: "hello"}]
    }, {
      headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` }
    });
    console.log(res.data);
  } catch (e) {
    console.error(e.code, e.message, e.response?.data);
  }
})();
