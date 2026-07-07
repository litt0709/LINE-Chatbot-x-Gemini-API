require('dotenv').config({ path: '.env.line-ai-chatbot-eab18' });
const { searchTavily } = require('./utils/tavily');
const { searchExa } = require('./utils/exa');

async function test() {
  const query = "brazil thua na uy mà nhỉ";
  const [t, e] = await Promise.allSettled([searchTavily(query), searchExa(query)]);
  console.log("=== TAVILY ===");
  if (t.status === 'fulfilled') console.log(t.value);
  console.log("=== EXA ===");
  if (e.status === 'fulfilled') console.log(e.value);
}
test();
