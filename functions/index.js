const {onRequest} = require("firebase-functions/v2/https");
const line = require("./utils/line");
const gemini = require("./utils/gemini");
const deepseek = require("./utils/deepseek");

exports.webhook = onRequest(async (req, res) => {
  if (req.method === "POST") {
    const events = req.body.events;
    for (const event of events) {
      switch (event.type) {
        case "message":

          if (event.message.type === "text") {
            const userId = event.source.userId;
            let msg;
            if (process.env.LLM_PROVIDER === "DEEPSEEK") {
              msg = await deepseek.chat(userId, event.message.text);
            } else {
              msg = await gemini.chat(userId, event.message.text);
            }
            await line.reply(event.replyToken, [{ type: "text", text: msg }]);
            return res.end();
          }

          if (event.message.type === "image") {
            const imageBinary = await line.getImageBinary(event.message.id);
            const msg = await gemini.multimodal(imageBinary);
            await line.reply(event.replyToken, [{ type: "text", text: msg }]);
            return res.end();
          }

          break;
      }
    }
  }
  
  res.send(req.method);
});