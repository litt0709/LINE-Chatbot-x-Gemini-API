const figlet = require("figlet");

function handleAsciiCommand(prompt) {
  const asciiMatch = prompt.match(/(?:^|\s)(?:\/)?(vẽ) (chữ|tên|ascii)\s+(.+)/i);
  if (!asciiMatch) return null;

  let textToDraw = asciiMatch[3].trim();

  // 1. Nếu người dùng dùng ngoặc kép (vd: vẽ chữ "Lâm" xem nào) -> Lấy phần trong ngoặc
  const quoteMatch = textToDraw.match(/["'“](.*?)["'”]/);
  if (quoteMatch) {
    textToDraw = quoteMatch[1];
  } else {
    // 2. Loại bỏ các từ khóa giao tiếp thừa ở cuối câu
    const stopWords = ["xem nào", "xem", "nào", "đi", "nhé", "nha", "coi", "thử", "với", "nhỉ", "xem sao", "hộ cái", "giùm", "cho tôi"];
    const stopWordsRegex = new RegExp(`\\s+(${stopWords.join('|')})\\s*$`, 'gi');
    
    let prevText = "";
    while (textToDraw !== prevText) {
      prevText = textToDraw;
      textToDraw = textToDraw.replace(stopWordsRegex, '');
    }
  }

  textToDraw = textToDraw.trim();

  let asciiText = "";
  try {
    asciiText = figlet.textSync(textToDraw, { font: "Standard" });
  } catch (e) {
    console.error("Figlet error:", e.message);
    asciiText = "Lỗi: " + e.message;
  }
  
  return "Dạ đây là tác phẩm ASCII của anh/chị nè! ✨\n```\n" + asciiText + "\n```";
}

module.exports = {
  handleAsciiCommand
};
