const figlet = require("figlet");

function handleAsciiCommand(prompt) {
  const asciiMatch = prompt.match(/^(vẽ) (chữ|tên|ascii)\s+(.+)/i);
  if (!asciiMatch) return null;

  const textToDraw = asciiMatch[3];
  let asciiText = "";
  try {
    // Thử load module font manually (figlet trick)
    figlet.textSync("test", { font: "Standard" }); 
    asciiText = figlet.textSync(textToDraw, { font: "Slant" });
  } catch (e) {
    console.error("Figlet error:", e.message);
    asciiText = "Lỗi: " + e.message;
  }
  
  return "Dạ đây là tác phẩm ASCII của anh/chị nè! ✨\n```\n" + asciiText + "\n```";
}

module.exports = {
  handleAsciiCommand
};
