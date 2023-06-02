import * as dotenv from "dotenv";
dotenv.config();
import { IConfig } from "./interface";

export const config: IConfig = {
  api: process.env.API,
  openai_api_key: process.env.OPENAI_API_KEY || "",
  model: process.env.MODEL || "gpt-3.5-turbo",
  chatPrivateTriggerKeyword: process.env.CHAT_PRIVATE_TRIGGER_KEYWORD || "",// 私聊触发关键词，默认无需关键词
  chatTriggerRule: process.env.CHAT_TRIGGER_RULE || "",// 私聊触发规则，默认无，与上面的二存一
  disableGroupMessage: process.env.DISABLE_GROUP_MESSAGE === "true",
  temperature: process.env.TEMPERATURE ? parseFloat(process.env.TEMPERATURE) : 0.2,
  blockWords: process.env.BLOCK_WORDS ? process.env.BLOCK_WORDS.split(",") : [],// 注意："".split(",") => [''] 会产生 bug
  chatgptBlockWords: process.env.CHATGPT_BLOCK_WORDS ? process.env.CHATGPT_BLOCK_WORDS.split(",") : [],// 同上
};
