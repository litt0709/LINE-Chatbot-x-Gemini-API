const fs = require('fs');

const searchPath = 'functions/utils/search.js';
let searchContent = fs.readFileSync(searchPath, 'utf8');

const newsKeywords = '|hạ tầng cơ bản|điện đường trường trạm|quy hoạch đường xá|trục lợi nhóm|Nghị quyết 19|sân bay Long Thành|tra tấn chó Trung Quốc|Iran tấn công Amazon Bahrain|thứ trưởng hoàng trung bị bắt|xuất khẩu sầu riêng|nhận hối lộ|khai trừ Đảng';
const financeKeywords = '|in tiền|Cloud Kitchen|phân tích kinh doanh|biên lợi nhuận|chi phí vận hành|bitcoin';
const devKeywords = '|quốc gia thử nghiệm công nghệ|hệ sinh thái công nghệ sâu|Moonshot AI|lỗi bot|Hallucination|Inappropriate proactive interaction|LLM|TTS';
const socialKeywords = '|nhất sếp|kiến nghị change.org|phim Odyseey|phim Spider-Man|CGV ghế nằm';

searchContent = searchContent.replace(/(NEWS: \/.*?)\/i,/, `$1${newsKeywords}/i,`);
searchContent = searchContent.replace(/(FINANCE: \/.*?)\/i,/, `$1${financeKeywords}/i,`);
searchContent = searchContent.replace(/(DEV: \/.*?)\/i,/, `$1${devKeywords}/i,`);
searchContent = searchContent.replace(/(SOCIAL: \/.*?)\/i/, `$1${socialKeywords}/i`);

fs.writeFileSync(searchPath, searchContent, 'utf8');

const deepseekPath = 'functions/utils/deepseek.js';
let deepseekContent = fs.readFileSync(deepseekPath, 'utf8');

const newLinkReqs = '|trang nào phim chuẩn|lấy thông tin đó ở đâu|nguồn ở đâu';
deepseekContent = deepseekContent.replace(/(xin link\|nguồn đâu\|.*?)\|phân tích chi tiết về\/i/, `$1${newLinkReqs}|phân tích chi tiết về/i`);

const newTopics = '|Nghị quyết 19|kinh tế dựa trên tri thức|tự chủ chiến lược|sân bay Long Thành|luật bảo vệ động vật|thị trường AI|Moonshot AI|rạp chiếu phim|CGV ghế nằm|Line OA outage|tiền kỹ thuật số quốc gia|bitcoin';
deepseekContent = deepseekContent.replace(/(STANDALONE_TOPICS = \[\s*[\s\S]*?)(    \];)/, (match, p1, p2) => {
  return p1 + `      /Nghị quyết 19/i, /kinh tế dựa trên tri thức/i, /tự chủ chiến lược/i, /sân bay Long Thành/i, /luật bảo vệ động vật/i, /thị trường AI/i, /Moonshot AI/i, /rạp chiếu phim/i, /CGV ghế nằm/i, /Line OA outage/i, /tiền kỹ thuật số quốc gia/i, /bitcoin/i\n` + p2;
});

fs.writeFileSync(deepseekPath, deepseekContent, 'utf8');
console.log('Done modifying files.');
