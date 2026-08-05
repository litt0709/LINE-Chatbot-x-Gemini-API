const { execSync } = require('child_process');

const PRICES = {
  "deepseek-v4-flash": { prompt: 0.07 / 1000000, completion: 0.14 / 1000000 },
  "deepseek-v4-pro": { prompt: 0.55 / 1000000, completion: 2.19 / 1000000 }
};

const WEB_SEARCH_PRICE = 0.005; // Tavily $5 per 1000 requests

function fetchData(project, path) {
  try {
    const output = execSync(`firebase use ${project} && firebase database:get ${path}`, { encoding: 'utf-8', stdio: 'pipe' });
    const jsonStr = output.split('\n').filter(line => line.trim().startsWith('{') || line.trim().startsWith('[') || line.trim() === 'null').join('');
    if (jsonStr.trim() === 'null') return {};
    return jsonStr ? JSON.parse(jsonStr) : {};
  } catch (e) {
    return {};
  }
}

async function generateReport() {
  try {
    const teleTokens = fetchData('tele-ai-chatbot', '/metrics/daily_tokens');
    const lineTokens = fetchData('line-ai-chatbot-eab18', '/metrics/daily_tokens');
    
    const teleSearch = fetchData('tele-ai-chatbot', '/metrics/monthly_calls');
    const lineSearch = fetchData('line-ai-chatbot-eab18', '/metrics/monthly_calls');

    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const targetMonths = [currentMonth];
    
    if (now.getDate() < 11) {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
      targetMonths.push(prevMonth);
    }

    const combinedTokens = {};
    const mergeTokens = (data) => {
      if (!data) return;
      for (const [date, models] of Object.entries(data)) {
        if (!combinedTokens[date]) combinedTokens[date] = {};
        for (const [model, usage] of Object.entries(models)) {
          if (!combinedTokens[date][model]) combinedTokens[date][model] = { prompt_tokens: 0, completion_tokens: 0 };
          combinedTokens[date][model].prompt_tokens += (usage.prompt_tokens || 0);
          combinedTokens[date][model].completion_tokens += (usage.completion_tokens || 0);
        }
      }
    };
    
    mergeTokens(teleTokens);
    mergeTokens(lineTokens);

    const combinedSearches = {};
    const mergeSearches = (data) => {
      if (!data) return;
      for (const [month, usage] of Object.entries(data)) {
        if (!combinedSearches[month]) combinedSearches[month] = 0;
        combinedSearches[month] += (usage.tavily || 0);
      }
    };
    mergeSearches(teleSearch);
    mergeSearches(lineSearch);

    const monthlyStats = {};
    targetMonths.forEach(m => {
      monthlyStats[m] = {
        tokens_usd: 0,
        search_count: combinedSearches[m] || 0,
        search_usd: (combinedSearches[m] || 0) * WEB_SEARCH_PRICE,
        total_usd: 0,
        models: {}
      };
    });

    for (const [date, models] of Object.entries(combinedTokens)) {
      const month = date.substring(0, 7); 
      if (targetMonths.includes(month)) {
        for (const [model, usage] of Object.entries(models)) {
          const p_tokens = usage.prompt_tokens;
          const c_tokens = usage.completion_tokens;
          
          let cost = 0;
          if (PRICES[model]) {
            cost = (p_tokens * PRICES[model].prompt) + (c_tokens * PRICES[model].completion);
          }

          monthlyStats[month].tokens_usd += cost;
          monthlyStats[month].total_usd += cost;
          
          if (!monthlyStats[month].models[model]) {
            monthlyStats[month].models[model] = { prompt_tokens: 0, completion_tokens: 0, usd_cost: 0 };
          }
          monthlyStats[month].models[model].prompt_tokens += p_tokens;
          monthlyStats[month].models[model].completion_tokens += c_tokens;
          monthlyStats[month].models[model].usd_cost += cost;
        }
      }
    }

    for (const m of targetMonths) {
      monthlyStats[m].total_usd += monthlyStats[m].search_usd;
    }

    console.log(JSON.stringify({ status: "success", data: monthlyStats }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ status: "error", message: error.message }));
    process.exit(1);
  }
}
generateReport();
