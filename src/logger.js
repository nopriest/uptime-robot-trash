const winston = require('winston');
const path = require('path');

// 创建logs目录（如果不存在）
const fs = require('fs');
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 配置日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    return log;
  })
);

// 创建logger实例
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // 控制台输出
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),

    // 文件输出 - 所有日志
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),

    // 文件输出 - 错误日志
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 3
    })
  ]
});

/**
 * 清理日志文件
 * @param {boolean} isStartup - 是否为启动时清理
 */
function clearLogs(isStartup = false) {
  try {
    const logTypes = ['combined', 'error'];
    let clearedFiles = [];
    
    logTypes.forEach(type => {
      const logFile = path.join(logsDir, `${type}.log`);
      
      try {
        // 确保日志目录存在
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir, { recursive: true });
        }
        
        if (fs.existsSync(logFile)) {
          // 检查文件大小，如果大于1MB则清理
          const stats = fs.statSync(logFile);
          const fileSizeInMB = stats.size / (1024 * 1024);
          
          if (fileSizeInMB > 1 || isStartup) {
            // 尝试清空文件，如果权限不足则跳过
            try {
              fs.writeFileSync(logFile, '', 'utf8');
              clearedFiles.push(`${type}.log`);
            } catch (writeError) {
              // 如果写入失败，尝试创建新文件
              if (writeError.code === 'EACCES') {
                logger.warn(`日志文件权限不足，跳过清理: ${type}.log`, {
                  error: writeError.message,
                  file: logFile
                });
              } else {
                throw writeError;
              }
            }
          }
        }
      } catch (fileError) {
        logger.warn(`处理日志文件时出错: ${type}.log`, {
          error: fileError.message,
          file: logFile
        });
      }
    });

    if (clearedFiles.length > 0) {
      logger.info('日志已自动清理', {
        clearedFiles,
        reason: isStartup ? '启动时清理' : '定时清理',
        timestamp: new Date().toISOString()
      });
    }
    
    return clearedFiles;
  } catch (error) {
    logger.error('自动清理日志失败', { error: error.message });
    return [];
  }
}

/**
 * 启动定时清理日志的定时器
 * @param {number} intervalHours - 清理间隔（小时）
 */
function startLogCleanupTimer(intervalHours = 5) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  
  // 立即执行一次清理
  clearLogs(false);
  
  // 设置定时器
  setInterval(() => {
    clearLogs(false);
  }, intervalMs);
  
  logger.info('日志自动清理定时器已启动', {
    intervalHours,
    intervalMs,
    timestamp: new Date().toISOString()
  });
}

module.exports = logger;
module.exports.clearLogs = clearLogs;
module.exports.startLogCleanupTimer = startLogCleanupTimer;