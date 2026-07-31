const fs = require('fs');
const path = require('path');

const updateData = JSON.parse(fs.readFileSync(path.join(__dirname, '../functions/update_data.json'), 'utf8'));

// Helper to get keywords for search.js categories
const getKeywordsByCategory = (cat) => {
  return updateData.audit_keywords
    .filter(k => k.suggested_category === cat || (cat === 'DEV' && k.suggested_category === 'TECH') || (cat === 'FINANCE' && k.suggested_category === 'BUSINESS') || (cat === 'GENERAL' && k.suggested_category === 'GENERAL'))
    .map(k => k.word.toLowerCase())
    .join('|');
};

const newsKws = getKeywordsByCategory('NEWS');
const financeKws = getKeywordsByCategory('FINANCE');
const devKws = getKeywordsByCategory('DEV');
const socialKws = getKeywordsByCategory('SOCIAL');

// 1. Update search.js
let searchJs = fs.readFileSync(path.join(__dirname, '../functions/utils/search.js'), 'utf8');

if (newsKws) searchJs = searchJs.replace(/NEWS: \/(.+?)\/i,/, `NEWS: /$1|${newsKws}/i,`);
if (financeKws) searchJs = searchJs.replace(/FINANCE: \/(.+?)\/i,/, `FINANCE: /$1|${financeKws}/i,`);
if (devKws) searchJs = searchJs.replace(/DEV: \/(.+?)\/i,/, `DEV: /$1|${devKws}/i,`);
if (socialKws) searchJs = searchJs.replace(/SOCIAL: \/(.+?)\/i/, `SOCIAL: /$1|${socialKws}/i`);

fs.writeFileSync(path.join(__dirname, '../functions/utils/search.js'), searchJs);
console.log('Updated search.js with new audit keywords.');

// 2. Update deepseek.js (missed_topics)
if (updateData.missed_topics && updateData.missed_topics.length > 0) {
  let deepseekJs = fs.readFileSync(path.join(__dirname, '../functions/utils/deepseek.js'), 'utf8');
  const newTopics = updateData.missed_topics.map(t => `/${t.toLowerCase().replace(/\//g, '\\/')}/i`).join(', ');
  
  deepseekJs = deepseekJs.replace(/(\/bảo mật dữ liệu chatbot\/i)\n    \];/, `$1, ${newTopics}\n    ];`);
  
  fs.writeFileSync(path.join(__dirname, '../functions/utils/deepseek.js'), deepseekJs);
  console.log('Updated deepseek.js with new missed topics.');
}

// 3. Update index.js (missed_proactive_keywords)
if (updateData.missed_proactive_keywords && updateData.missed_proactive_keywords.length > 0) {
  let indexJs = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
  
  const uniqueProactive = [...new Set(updateData.missed_proactive_keywords.map(w => w.toLowerCase()))];
  const newProactiveStr = uniqueProactive.map(w => `"${w}"`).join(', ');
  
  indexJs = indexJs.replace(/(const PROACTIVE_TRIGGER_WORDS = \[)([^\]]+)(\];)/, (match, p1, p2, p3) => {
    return `${p1}${p2}, ${newProactiveStr}${p3}`;
  });
  
  fs.writeFileSync(path.join(__dirname, '../functions/index.js'), indexJs);
  console.log('Updated index.js with new proactive trigger words.');
}

// 4. Update leak_blacklist.json (prompt_leakage)
// Data is empty according to update_data.json, but handled generically just in case.
if (updateData.prompt_leakage && updateData.prompt_leakage.length > 0) {
    const leakFile = path.join(__dirname, '../functions/utils/leak_blacklist.json');
    let leakList = [];
    if (fs.existsSync(leakFile)) {
        leakList = JSON.parse(fs.readFileSync(leakFile, 'utf8'));
    }
    const removeAccents = (str) => {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
    };
    const newLeaks = updateData.prompt_leakage.map(q => removeAccents(q.toLowerCase()).trim());
    const combined = [...new Set([...leakList, ...newLeaks])];
    fs.writeFileSync(leakFile, JSON.stringify(combined, null, 2));
    console.log('Updated leak_blacklist.json');
}

console.log('Code update script finished successfully.');
