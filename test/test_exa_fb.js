const axios = require("axios");
require("dotenv").config();
const EXA_API_KEY = process.env.EXA_API_KEY;

const testExa = async () => {
  try {
    const { data } = await axios.post("https://api.exa.ai/search", {
      query: "https://www.facebook.com/zuck/posts/10114026953827761",
      useAutoprompt: true,
      numResults: 1,
      contents: { text: true }
    }, {
      headers: { "x-api-key": EXA_API_KEY, "Content-Type": "application/json" }
    });
    console.log(JSON.stringify(data, null, 2));
  } catch (e) { console.error(e.message); }
};
testExa();
