const { execSync } = require('child_process');

const PRICES = {
  "deepseek-v4-flash": { prompt: 0.07 / 1000000, completion: 0.14 / 1000000 },
  "deepseek-v4-pro": { prompt: 0.55 / 1000000, completion: 2.19 / 1000000 }
};

function fetchProjectData(project) {
  try {
    const output = execSync(`firebase use ${project} && firebase database:get /metrics/daily_tokens`, { encoding: 'utf-8', stdio: 'pipe' });
    const jsonStr = output.split('\n').filter(line => line.trim().startsWith('{')).join('');
    return jsonStr ? JSON.parse(jsonStr) : {};
  } catch (e) {
    return {};
  }
}

async function generateReport() {
  try {
    const teleData = fetchProjectData('tele-ai-chatbot');
    const lineData = fetchProjectData('line-ai-chatbot-eab18');
    
    // Combine data
    const combined = {};
    const mergeData = (data) => {
      if (!data) return;
      for (const [date, models] of Object.entries(data)) {
        if (!combined[date]) combined[date] = {};
        for (const [model, usage] of Object.entries(models)) {
          if (!combined[date][model]) combined[date][model] = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          combined[date][model].prompt_tokens += (usage.prompt_tokens || 0);
          combined[date][model].completion_tokens += (usage.completion_tokens || 0);
          combined[date][model].total_tokens += ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
        }
      }
    };
    
    mergeData(teleData);
    mergeData(lineData);

    if (Object.keys(combined).length === 0) {
      console.log(JSON.stringify({ status: "success", data: {}, message: "No data available." }));
      process.exit(0);
    }

    const result = {};
    for (const [date, models] of Object.entries(combined)) {
      result[date] = {
        total_usd: 0,
        total_tokens: 0,
        models: {}
      };

      for (const [model, usage] of Object.entries(models)) {
        const p_tokens = usage.prompt_tokens;
        const c_tokens = usage.completion_tokens;
        const total = p_tokens + c_tokens;
        
        let cost = 0;
        if (PRICES[model]) {
          cost = (p_tokens * PRICES[model].prompt) + (c_tokens * PRICES[model].completion);
        }

        result[date].models[model] = {
          prompt_tokens: p_tokens,
          completion_tokens: c_tokens,
          total_tokens: total,
          usd_cost: cost
        };

        result[date].total_tokens += total;
        result[date].total_usd += cost;
      }
    }

    // Lọc lấy 7 ngày gần nhất
    const sortedDates = Object.keys(result).sort().reverse().slice(0, 7);
    const finalReport = {};
    for (const d of sortedDates) {
      finalReport[d] = result[d];
    }

    console.log(JSON.stringify({ status: "success", data: finalReport }, null, 2));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({ status: "error", message: error.message }));
    process.exit(1);
  }
}

generateReport();
