import { ContactImpl, ContactInterface, RoomImpl, RoomInterface } from "wechaty/impls";
import { Message } from "wechaty";
import { FileBox } from "file-box";
import { config } from "./config.js";
import { chatgpt, dalle, whisper } from "./openai.js";
import DBUtils from "./data.js";
import { regexpEncode } from "./utils.js";
import logger from "./services/logger.js";

enum MessageType {
  Unknown = 0,
  Attachment = 1, // Attach(6),
  Audio = 2, // Audio(1), Voice(34)
  Contact = 3, // ShareCard(42)
  ChatHistory = 4, // ChatHistory(19)
  Emoticon = 5, // Sticker: Emoticon(15), Emoticon(47)
  Image = 6, // Img(2), Image(3)
  Text = 7, // Text(1)
  Location = 8, // Location(48)
  MiniProgram = 9, // MiniProgram(33)
  GroupNote = 10, // GroupNote(53)
  Transfer = 11, // Transfers(2000)
  RedEnvelope = 12, // RedEnvelopes(2001)
  Recalled = 13, // Recalled(10002)
  Url = 14, // Url(5)
  Video = 15, // Video(4), Video(43)
  Post = 16, // Moment, Channel, Tweet, etc
}
const SINGLE_MESSAGE_MAX_SIZE = 500;// 单次会话最大记录数量
type Speaker = RoomImpl | ContactImpl;
interface ICommand {
  name: string;
  description: string;
  exec: (talker: Speaker, text: string) => Promise<void>;
}
export class ChatGPTBot {
  chatPrivateTriggerKeyword = config.chatPrivateTriggerKeyword;
  chatTriggerRule = config.chatTriggerRule ? new RegExp(config.chatTriggerRule) : undefined;
  disableGroupMessage = config.disableGroupMessage || false;
  botName: string = "";
  ready = false;
  setBotName(botName: string) {
    this.botName = botName;
  }
  get chatGroupTriggerRegEx(): RegExp {
    return new RegExp(`^@${regexpEncode(this.botName)}\\s`);
  }
  // 聊天专用触发规则
  get chatPrivateTriggerRule(): RegExp | undefined {
    const { chatPrivateTriggerKeyword, chatTriggerRule } = this;
    let regEx = chatTriggerRule;
    if (!regEx && chatPrivateTriggerKeyword) {
      regEx = new RegExp(regexpEncode(chatPrivateTriggerKeyword));
    }
    return regEx;
  }
  private readonly commands: ICommand[] = [
    {
      name: "help",
      description: "显示帮助信息",
      exec: async (talker) => {
        await this.trySay(talker, "========\n" +
          "/cmd help\n" +
          "# 显示帮助信息\n" +
          "/cmd prompt <PROMPT>\n" +
          "# 设置当前会话的 prompt \n" +
          "/img <PROMPT>\n" +
          "# 根据 prompt 生成图片\n" +
          "/cmd clear\n" +
          "# 清除自上次启动以来的所有会话\n" +
          "========");
      }
    },
    {
      name: "prompt",
      description: "设置当前会话的prompt",
      exec: async (talker, prompt) => {
        if (talker instanceof RoomImpl) {
          DBUtils.setPrompt(await talker.topic(), prompt);
        } else {
          DBUtils.setPrompt(talker.name(), prompt);
        }
      }
    },
    {
      name: "clear",
      description: "清除自上次启动以来的所有会话",
      exec: async (talker) => {
        if (talker instanceof RoomImpl) {
          DBUtils.clearHistory(await talker.topic());
        } else {
          DBUtils.clearHistory(talker.name());
        }
      }
    }
  ]

  /**
   * EXAMPLE:
   *       /cmd help
   *       /cmd prompt <PROMPT>
   *       /cmd img <PROMPT>
   *       /cmd clear
   * @param contact
   * @param rawText
   */
  async command(contact: any, rawText: string): Promise<void> {
    const [commandName, ...args] = rawText.split(/\s+/);
    const command = this.commands.find(
      (command) => command.name === commandName
    );
    if (command) {
      await command.exec(contact, args.join(" "));
    }
  }
  // 删除更多次对话和提及
  cleanMessage(rawText: string, privateChat: boolean = false): string {
    let text = rawText;
    const item = rawText.split("- - - - - - - - - - - - - - -");
    if (item.length > 1) {
      text = item[item.length - 1];
    }

    const { chatTriggerRule, chatPrivateTriggerRule } = this;

    if (privateChat && chatPrivateTriggerRule) {
      text = text.replace(chatPrivateTriggerRule, "")
    } else if (!privateChat) {
      text = text.replace(this.chatGroupTriggerRegEx, "")
      text = chatTriggerRule ? text.replace(chatTriggerRule, "") : text
    }
    // remove more text via - - - - - - - - - - - - - - -
    return text
  }
  async getGPTMessage(talkerName: string, text: string): Promise<string> {
    let gptMessage = await chatgpt(talkerName, text);
    // logger.msg({ line: 'bot.ts - 137', gptMessage });
    if (gptMessage !== "") {
      DBUtils.addAssistantMessage(talkerName, gptMessage);
      return gptMessage;
    }
    return "抱歉，请稍后重试。😔";
  }
  // 检查 chatgpt 返回的消息是否包含屏蔽词
  checkChatGPTBlockWords(message: string): boolean {
    return config.chatgptBlockWords.length > 0 && config.chatgptBlockWords.some((word) => message.includes(word)) || false;
  }
  // 根据消息的大小对消息进行分段
  async trySay(talker: RoomInterface | ContactInterface, mesasge: string): Promise<void> {
    const messages: Array<string> = [];
    if (this.checkChatGPTBlockWords(mesasge)) {
      console.log(`🚫 回复内容包含屏蔽词：${mesasge}`);
      return;
    }
    let message = mesasge;
    while (message.length > SINGLE_MESSAGE_MAX_SIZE) {
      messages.push(message.slice(0, SINGLE_MESSAGE_MAX_SIZE));
      message = message.slice(SINGLE_MESSAGE_MAX_SIZE);
    }
    messages.push(message);
    for (const msg of messages) {
      await talker.say(msg);
    }
  }
  // 检查是否可以触发 chatgpt 处理
  triggerGPTMessage(text: string, privateChat: boolean = false): boolean {
    const { chatTriggerRule } = this;
    let triggered = false;
    if (privateChat) {
      const regEx = this.chatPrivateTriggerRule
      triggered = regEx ? regEx.test(text) : true;
    } else {
      triggered = this.chatGroupTriggerRegEx.test(text);
      // group message support `chatTriggerRule`
      if (triggered && chatTriggerRule) {
        triggered = chatTriggerRule.test(text.replace(this.chatGroupTriggerRegEx, ""))
      }
    }
    if (triggered) {
      console.log(`🎯 Triggered ChatGPT: ${text}`);
    }
    return triggered;
  }
  // 检查消息是否包含被屏蔽的词汇。如果包含，消息将被忽略，即返回true。
  checkBlockWords(message: string): boolean {
    return config.blockWords.length > 0 ? config.blockWords.some((word) => message.includes(word)) : false;
  }
  // 过滤掉不需要或无法处理的消息
  isNonsense(talker: ContactInterface, messageType: MessageType, text: string): boolean {
    return (
      // 自己
      talker.self() ||
      !text || !text.trim() ||
      // TODO: 添加对文档的支持
      !(messageType == MessageType.Text || messageType == MessageType.Audio) ||
      // 微信团队
      talker.name() === "微信团队" ||
      // 语音(视频)消息
      text.includes("收到一条视频/语音聊天消息，请在手机上查看") ||
      // 红包消息
      text.includes("收到红包，请在手机上查看") ||
      // 转账信息
      text.includes("收到转账，请在手机上查看") ||
      // 位置消息
      text.includes("/cgi-bin/mmwebwx-bin/webwxgetpubliclinkimg") ||
      // 聊天屏蔽词
      this.checkBlockWords(text)
    );
  }
  async onPrivateMessage(talker: ContactInterface, text: string) {
    const gptMessage = await this.getGPTMessage(talker.name(), text);
    // logger.msg({ line: 'bot.ts - 212', gptMessage });
    await this.trySay(talker, gptMessage);
  }
  async onGroupMessage(talker: ContactInterface, text: string, room: RoomInterface) {
    const gptMessage = await this.getGPTMessage(await room.topic(), text);
    const result = `@${talker.name()} ${text}\n\n------\n ${gptMessage}`;
    await this.trySay(room, result);
  }
  async onMessage(message: Message) {
    const talker = message.talker();
    const rawText = message.text();
    const room = message.room();
    const messageType = message.type();
    const receiver = message.to();
    const privateChat = !room;
    // logger.msg({ line: 'bot.ts - 227', message });
    let shouldSay = false;// 是否应该回复消息
    if (privateChat) {
      console.log(`🤵 用户： ${talker.name()} 💬 消息：${rawText}`);
      // 检查唤醒关键词
      shouldSay = !this.chatPrivateTriggerKeyword || rawText.startsWith(this.chatPrivateTriggerKeyword) || false;
    } else {
      // 群聊中是否被@
      shouldSay = await message.mentionSelf();
      const topic = await room.topic();
      console.log(`🚪 群聊：${topic} 🤵 用户：${talker.name()} 💬 消息：${rawText}`);
    }
    if (shouldSay) {
      shouldSay = !this.isNonsense(talker, messageType, rawText);
    }
    if (!shouldSay) {
      logger.msg({ line: 'bot.ts - 243', message: "亲，这是一条无需或无法处理的消息。" });
      return;
    }
    if (messageType == MessageType.Text) {
      if (room) {
        const content = rawText.replace(RegExp(`^@${receiver?.name()}\\s+${this.chatPrivateTriggerKeyword}[\\s]*`), "");
        await this.onPrivateMessage(talker, content);
      } else {
        await this.onPrivateMessage(talker, rawText);
      }
    } else if (messageType == MessageType.Audio) {
      // 保存语音文件
      const fileBox = await message.toFileBox();
      let fileName = "./public/" + fileBox.name;
      await fileBox.toFile(fileName, true).catch((e) => {
        console.log("保存语音失败", e);
        return;
      });
      // Whisper
      whisper("", fileName).then((text) => {
        message.say(text);
      });
      return;
    }
    if (rawText.startsWith("/cmd ")) {
      logger.test({ line: 'bot.ts - 268', msg: 'rawText.startsWith("/cmd ")' });
      console.log(`🤖 Command: ${rawText}`);
      const cmdContent = rawText.slice(5); // 「/cmd 」一共5个字符(注意空格)
      if (privateChat) {
        await this.command(talker, cmdContent);
      } else {
        await this.command(room, cmdContent);
      }
      return;
    }
    // 使用DallE生成图片
    if (rawText.startsWith("/img")) {
      logger.test({ line: 'bot.ts - 280', msg: 'rawText.startsWith("/cmd ")' });
      console.log(`🤖 Image: ${rawText}`);
      const imgContent = rawText.slice(4);
      if (privateChat) {
        let url = await dalle(talker.name(), imgContent) as string;
        const fileBox = FileBox.fromUrl(url);
        message.say(fileBox);
      } else {
        let url = await dalle(await room.topic(), imgContent) as string;
        const fileBox = FileBox.fromUrl(url);
        message.say(fileBox);
      }
      return;
    }
    // if (this.triggerGPTMessage(rawText, privateChat)) {
    //   const text = this.cleanMessage(rawText, privateChat);
    //   if (privateChat) {
    //     return await this.onPrivateMessage(talker, text);
    //   } else {
    //     if (!this.disableGroupMessage) {
    //       return await this.onGroupMessage(talker, text, room);
    //     } else {
    //       return;
    //     }
    //   }
    // } else {
    //   return;
    // }
  }
}
