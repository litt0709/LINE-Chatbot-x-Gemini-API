const axios = require('axios');
require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });

async function check() {
  try {
    const exaRes = await axios.post("https://api.exa.ai/search", {
      query: "world cup 2026",
      numResults: 2,
      sort_by: "published_date" // Let's see if this throws a 400 Bad Request
    }, {
      headers: { "x-api-key": process.env.EXA_API_KEY }
    });
    console.log("Exa accepted sort_by:", exaRes.status);
  } catch (e) {
    console.log("Exa rejected sort_by:", e.response?.data);
  }

  try {
    const tavilyRes = await axios.post("https://api.tavily.com/search", {
      api_key: process.env.TAVILY_API_KEY,
      query: "world cup 2026",
      topic: "news",
      sort_by: "date" // Testing if Tavily supports this
    });
    console.log("Tavily accepted sort_by:", tavilyRes.status);
  } catch (e) {
    console.log("Tavily rejected sort_by:", e.response?.data);
  }
}
check();
