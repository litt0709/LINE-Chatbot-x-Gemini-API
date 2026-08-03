const fs = require("fs");
const path = require("path");

const searchPath = path.join(__dirname, "../functions/utils/search.js");
const deepseekPath = path.join(__dirname, "../functions/utils/deepseek.js");

// 1. Update search.js
let searchContent = fs.readFileSync(searchPath, "utf8");

const newsAdditions = "chi phí ở tù tại Mỹ|án treo ở Việt Nam|phạt nguội";
const financeAdditions = "đội tàu hàng nghìn tỷ|sếp đối tác|trưởng phòng kinh doanh|chi phí cơ hội|hạch toán kinh doanh";
const devAdditions = "computer vision|camera đường phố|label boxing|GPU training|thời đại AI";
const socialAdditions = "sinh năm 91|uống k bao h say|giao tiếp|cày bộ này|táo bón|công thần";

searchContent = searchContent.replace(/NEWS: \/(.+?)\/i,/, (match, p1) => `NEWS: /${p1}|${newsAdditions}/i,`);
searchContent = searchContent.replace(/FINANCE: \/(.+?)\/i,/, (match, p1) => `FINANCE: /${p1}|${financeAdditions}/i,`);
searchContent = searchContent.replace(/DEV: \/(.+?)\/i,/, (match, p1) => `DEV: /${p1}|${devAdditions}/i,`);
searchContent = searchContent.replace(/SOCIAL: \/(.+?)\/i/, (match, p1) => `SOCIAL: /${p1}|${socialAdditions}/i`);

fs.writeFileSync(searchPath, searchContent, "utf8");
console.log("Successfully updated search.js");

// 2. Update deepseek.js
let deepseekContent = fs.readFileSync(deepseekPath, "utf8");
const missedTopics = ["thành công doanh nhân trẻ", "ngành vận tải biển", "văn hóa nhậu"];
const topicRegexes = missedTopics.map(t => `/${t}/i`).join(", ");

deepseekContent = deepseekContent.replace(/(\/bitcoin\/i)\n    \];/, `$1, ${topicRegexes}\n    ];`);

fs.writeFileSync(deepseekPath, deepseekContent, "utf8");
console.log("Successfully updated deepseek.js");
