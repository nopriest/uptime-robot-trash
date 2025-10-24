const fs = require('fs');
const path = require('path');
const logger = require('../src/logger');

class ConfigManager {
  constructor() {
    this.configPath = process.env.CONFIG_PATH || path.join(__dirname, 'urls.json');
    this.config = null;
    this.lastModified = null;
  }

  /**
   * 加载配置文件
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.error(`配置文件不存在: ${this.configPath}`);
        process.exit(1);
      }

      const stats = fs.statSync(this.configPath);
      const currentModified = stats.mtime.getTime();

      // 如果配置文件已修改，重新加载
      if (!this.config || this.lastModified !== currentModified) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        this.config = JSON.parse(configData);
        this.lastModified = currentModified;

        logger.info('配置文件已加载', {
          configPath: this.configPath,
          urlsCount: this.config.urls?.length || 0,
          lastModified: new Date(currentModified).toISOString()
        });
      }

      return this.config;

    } catch (error) {
      logger.error('加载配置文件失败', {
        configPath: this.configPath,
        error: error.message
      });
      process.exit(1);
    }
  }

  /**
   * 获取URL配置列表
   */
  getUrlConfigs() {
    const config = this.loadConfig();
    return config.urls || [];
  }

  /**
   * 验证URL配置
   */
  validateUrlConfig(urlConfig) {
    const requiredFields = ['id', 'url', 'intervalSeconds'];
    const missingFields = requiredFields.filter(field => !urlConfig[field]);

    if (missingFields.length > 0) {
      throw new Error(`URL配置缺少必要字段: ${missingFields.join(', ')}`);
    }

    // 验证URL格式
    try {
      new URL(urlConfig.url);
    } catch (error) {
      throw new Error(`无效的URL格式: ${urlConfig.url}`);
    }

    // 验证间隔时间
    if (urlConfig.intervalSeconds < 10) {
      logger.warn(`访问间隔过短 (建议最少10秒): ${urlConfig.id}`, {
        interval: urlConfig.intervalSeconds
      });
    }

    return true;
  }

  /**
   * 处理模板变量
   */
  processTemplateData(data) {
    if (typeof data === 'string') {
      return data.replace('{{current_time}}', new Date().toISOString());
    } else if (typeof data === 'object' && data !== null) {
      const processed = {};
      for (const [key, value] of Object.entries(data)) {
        processed[key] = this.processTemplateData(value);
      }
      return processed;
    }
    return data;
  }

  /**
   * 获取处理后的URL配置列表
   */
  getProcessedUrlConfigs() {
    const urlConfigs = this.getUrlConfigs();
    const processedConfigs = [];

    for (const config of urlConfigs) {
      try {
        this.validateUrlConfig(config);

        // 处理模板变量
        const processedConfig = { ...config };
        if (processedConfig.data) {
          processedConfig.data = this.processTemplateData(processedConfig.data);
        }

        processedConfigs.push(processedConfig);

      } catch (error) {
        logger.error('URL配置验证失败', {
          id: config.id,
          error: error.message
        });
      }
    }

    return processedConfigs;
  }

  /**
   * 监听配置文件变化
   */
  watchConfig(callback) {
    if (!fs.existsSync(this.configPath)) {
      logger.error(`无法监听配置文件，文件不存在: ${this.configPath}`);
      return;
    }

    fs.watchFile(this.configPath, async (curr, prev) => {
      if (curr.mtime !== prev.mtime) {
        logger.info('配置文件已修改，重新加载...');
        try {
          this.config = null; // 强制重新加载
          const newConfigs = this.getProcessedUrlConfigs();
          await callback(newConfigs);
        } catch (error) {
          logger.error('重新加载配置失败', { error: error.message });
        }
      }
    });

    logger.info('开始监听配置文件变化', { configPath: this.configPath });
  }
}

module.exports = ConfigManager;