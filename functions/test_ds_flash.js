require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const axios = require('axios');
(async () => {
  try {
    const res = await axios.post("https://api.deepseek.com/chat/completions", {
      model: "deepseek-v4-flash",
      messages: [{role: "user", content: "hello"}]
    }, {
      headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` }
    });
    console.log("SUCCESS:", res.data.choices[0].message.content);
  } catch (e) {
    console.error("ERROR:", e.response ? e.response.data : e.message);
  }
})();
