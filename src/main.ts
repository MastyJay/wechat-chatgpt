import { WechatyBuilder } from "wechaty";
import QRCode from "qrcode";
import { ChatGPTBot } from "./bot.js";
import { config } from "./config.js";
import logger from "./services/logger.js";

const chatGPTBot = new ChatGPTBot();

const bot = WechatyBuilder.build({
  name: "wechat-assistant", // generate xxxx.memory-card.json and save login data for the next login
  puppet: "wechaty-puppet-wechat",
  puppetOptions: {
    uos: true
  }
});
async function main() {
  const initializedAt = Date.now()
  bot
    .on("scan", async (qrcode, status) => {
      const url = `https://wechaty.js.org/qrcode/${encodeURIComponent(qrcode)}`;
      console.log(`Scan QR Code to login: ${status}\n${url}`);
      const qrcodeStr = await QRCode.toString(qrcode, { type: "terminal", small: true });
      console.log(qrcodeStr);
      logger.msg({ line: 'main.ts - 24', status, url });
    })
    .on("login", async (user) => {
      const username = user.name();
      chatGPTBot.setBotName(username);
      console.log(`用户登录：${username}`);
      console.log(`私聊触发关键词：${config.chatPrivateTriggerKeyword}`);
      console.log(`聊天关键词屏蔽（${config.blockWords.length}个）：${config.blockWords}`);
      console.log(`回复关键词屏蔽（${config.chatgptBlockWords.length}个）：${config.chatgptBlockWords}`);
      logger.msg({ line: 'main.ts - 33', user, config });
    })
    .on("message", async (message) => {
      if (message.date().getTime() < initializedAt) {
        return;
      }
      if (message.text().startsWith("/ping")) {
        await message.say("pong");
        return;
      }
      try {
        await chatGPTBot.onMessage(message);
      } catch (error) {
        console.error(error);
        logger.error({ line: 'main.ts - 47', error });
      }
    });
  try {
    await bot.start();
  } catch (error) {
    console.error(`⚠️启动失败，可以通过在网上微信登录? ${error}`);
    logger.error({ line: 'main.ts - 54', message: '启动失败，可以通过在网上微信登录', error });
  }
}

main();
