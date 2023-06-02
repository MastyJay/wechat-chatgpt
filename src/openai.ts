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
  apiKey: config.openai_api_key,// parameter for apiKey security
  // organization: '',// OpenAI organization id
  // username: '',// parameter for basic security
  // password: '',// parameter for basic security
  // accessToken: '',// parameter for oauth2 security
  // basePath: config.api,// override base path
  // baseOptions: '',// base options for axios calls
});
const openai = new OpenAIApi(configuration);

/**
 * Get completion from OpenAI
 * @param username
 * @param message
 */
async function chatgpt(username: string, message: string): Promise<string> {
  // 先将用户输入的消息添加到数据库中
  let assistantMessage = "";
  try {
    DBUtils.addUserMessage(username, message);
    const messages = DBUtils.getChatMessage(username);
    logger.msg({ line: 'openai.ts - 29', messages });
    try {
      const response = await openai
        .createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: messages,
          temperature: config.temperature,
        });
      logger.msg({ line: 'openai.ts - 35', response });
      if (response.status === 200) {
        assistantMessage = response.data.choices[0].message?.content.replace(/^\n+|\n+$/g, "") as string || "";
      } else {
        assistantMessage = `出了点问题，错误信息： ${response.status}，${response.statusText}`;
      }
    } catch (error) {
      logger.error({ line: 'openai.ts - 45', assistantMessage, error });
    }
  } catch (error: any) {
    if (error.request) {
      assistantMessage = "请求出错";
    } else {
      assistantMessage = "未知错误";
    }
    logger.error({ line: 'openai.ts - 52', assistantMessage, error });
  }
  logger.msg({ line: 'openai.ts - 54', assistantMessage });
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
