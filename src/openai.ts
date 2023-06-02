import {
  Configuration,
  CreateImageRequestResponseFormatEnum,
  CreateImageRequestSizeEnum,
  OpenAIApi
} from "openai";
import fs from "fs";
import DBUtils from "./data.js";
import { config } from "./config.js";
import logger from "./services/logger.js";

const configuration = new Configuration({
  apiKey: config.openai_api_key,
  basePath: config.api,
});
const openai = new OpenAIApi(configuration);

/**
 * Get completion from OpenAI
 * @param username
 * @param message
 */
async function chatgpt(username: string, message: string): Promise<string> {
  // 先将用户输入的消息添加到数据库中
  DBUtils.addUserMessage(username, message);
  const messages = DBUtils.getChatMessage(username);
  const response = await openai
    .createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: messages,
      temperature: config.temperature,
    });
  let assistantMessage = "";
  try {
    if (response.status === 200) {
      assistantMessage = response.data.choices[0].message?.content.replace(/^\n+|\n+$/g, "") as string || "";
    } else {
      assistantMessage = `出了点问题，代码是： ${response.status}，${response.statusText}`;
    }
  } catch (e: any) {
    if (e.request) {
      assistantMessage = "请求出错";
    } else {
      assistantMessage = "未知错误";
    }
  }
  logger.test({ assistantMessage });
  return assistantMessage;
}

/**
 * Get image from Dall·E
 * @param username
 * @param prompt
 */
async function dalle(username: string, prompt: string): Promise<string> {
  const response = await openai
    .createImage({
      prompt: prompt,
      n: 1,
      size: CreateImageRequestSizeEnum._256x256,
      response_format: CreateImageRequestResponseFormatEnum.Url,
      user: username
    })
    .then((res) => res.data)
    .catch((err) => { console.log(err); });
  const assistantMessage = response ? response.data[0].url || "" : "生成图片失败";
  logger.test({ assistantMessage });
  return assistantMessage;
}

/**
 * Speech to text
 * @param username
 * @param videoPath
 */
async function whisper(username: string, videoPath: string): Promise<string> {
  const file: any = fs.createReadStream(videoPath);
  const response = await openai
    .createTranscription(file, "whisper-1")
    .then((res) => res.data)
    .catch((err) => console.log(err));
  const assistantMessage = response ? response.text || "" : "语音转文本失败";
  logger.test({ assistantMessage });
  return assistantMessage;
}

export { chatgpt, dalle, whisper };
