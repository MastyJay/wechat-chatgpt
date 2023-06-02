import fs from 'fs';
import { BaseObjectType } from './types/index';

/** 数据记录 */
function info(content: BaseObjectType) {
  log(content, 'info');
}
/** 错误记录 */
function error(content: BaseObjectType) {
  log(content, 'error');
}
/** 打印记录 */
function msg(content: BaseObjectType) {
  log(content, 'msg');
}
/** 测试记录 */
function test(content: BaseObjectType) {
  log(content, 'test');
}
function log(content: BaseObjectType, level: string) {
  try {
    const now = new Date();
    const folderPath = `./logs/${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const filePath = `${folderPath}/${level}.txt`;
    const message = '\n--------------------' + `\n日期：\n${now.toISOString()}` + '\n内容：\n' + JSON.stringify(content);
    fs.stat(folderPath, (err, stats) => {
      if (err) {
        fs.mkdir(
          folderPath,
          { recursive: true },// 递归创建不存在的父文件夹
          (error) => {
            if (error) {
              console.log("创建文件夹失败！");
            }
            else {
              // 检测日志文件
              checkLogFile(filePath, () => { recordLogToFile(filePath, message); });
            }
          }
        );
      } else if (stats.isDirectory()) {
        // 检测日志文件
        checkLogFile(filePath, () => { recordLogToFile(filePath, message); });
      } else {
        // 存在同名文件，无法创建文件夹
      }
    });
  } catch (error) {
    console.log(error);
  }
}
function checkLogFile(filePath: string, callback: () => void) {
  if (!fs.existsSync(filePath)) {
    fs.writeFile(filePath, " ", (error) => {
      if (error) {
        console.error('创建日志文件失败：', error);
      } else {
        callback();
      }
    });
  } else {
    callback();
  }
}
function recordLogToFile(filePath: string, message: string) {
  // 每次都会覆盖
  // fs.writeFile(path, message, (error) => {
  //   console.log(error);
  // });

  // 追加，推荐
  const loggStream = fs.createWriteStream(
    filePath,
    {
      flags: 'a',// a追加，w新建
    }
  );
  loggStream.write(message);
  loggStream.end();

  // 高并发有性能问题
  // fs.appendFile(
  //   `./logs/${now.toISOString()}-${level}.txt`,
  //   message,
  //   (error) => {
  //     console.log(error);
  //   }
  // );
}

export default { info, error, msg, test, };
