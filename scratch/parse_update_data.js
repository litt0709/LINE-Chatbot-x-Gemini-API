const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/update_data.json', 'utf8'));

// Filter and map keywords
const newNews = data.audit_keywords.filter(k => k.suggested_category === 'NEWS').map(k => k.word);
const newFinance = data.audit_keywords.filter(k => k.suggested_category === 'FINANCE').map(k => k.word);
const newTech = data.audit_keywords.filter(k => k.suggested_category === 'TECH').map(k => k.word);
const newGeneral = data.audit_keywords.filter(k => k.suggested_category === 'GENERAL').map(k => k.word);
const newSocial = data.audit_keywords.filter(k => k.suggested_category === 'SOCIAL').map(k => k.word);
const newDev = data.audit_keywords.filter(k => k.suggested_category === 'DEV').map(k => k.word);

const missedLinks = data.missed_link_requests;
const missedTopics = data.missed_topics;
const missedEntities = data.missed_entities;
const missedProactive = data.missed_proactive_keywords;
const leaks = data.prompt_leakage_questions;

console.log('--- NEWS ---');
console.log(newNews.join(', '));
console.log('\n--- FINANCE ---');
console.log(newFinance.join(', '));
console.log('\n--- TECH ---');
console.log(newTech.join(', '));
console.log('\n--- GENERAL ---');
console.log(newGeneral.join(', '));
console.log('\n--- SOCIAL ---');
console.log(newSocial.join(', '));
console.log('\n--- DEV ---');
console.log(newDev.join(', '));

console.log('\n--- LINKS ---');
console.log(missedLinks.join(', '));
console.log('\n--- TOPICS ---');
console.log(missedTopics.join(', '));
console.log('\n--- ENTITIES ---');
console.log(missedEntities.join(', '));
console.log('\n--- PROACTIVE ---');
console.log(missedProactive.join(', '));
console.log('\n--- LEAKS ---');
console.log(leaks.join(', '));
