#!/usr/bin/env node

const path = require('path');
const logger = require('./logger');
const Scheduler = require('./scheduler');
const ConfigManager = require('../config/configManager');
const WebServer = require('./webServer');

class AutoFangwenApp {
  constructor() {
    this.scheduler = new Scheduler();
    this.configManager = new ConfigManager();
    this.webServer = new WebServer(this.scheduler);
    this.isRunning = false;
  }

  /**
   * 初始化应用
   */
  async initialize() {
    try {
      logger.info('正在初始化Auto-Fangwen应用...');

      // 启动时自动清理日志
      logger.clearLogs(true);

      // 启动定时清理日志（每5小时）
      logger.startLogCleanupTimer(5);

      // 加载并验证配置
      const urlConfigs = this.configManager.getProcessedUrlConfigs();

      if (urlConfigs.length === 0) {
        logger.warn('没有找到有效的URL配置');
        return;
      }

      // 添加所有URL任务
      for (const config of urlConfigs) {
        try {
          this.scheduler.addUrlTask(config);
        } catch (error) {
          logger.error('添加URL任务失败', {
            id: config.id,
            error: error.message
          });
        }
      }

      // 启动调度器
      this.scheduler.start();

      // 启动Web服务器
      this.webServer.start();

      // 监听配置文件变化
      this.configManager.watchConfig(async (newConfigs) => {
        await this.reloadConfigs(newConfigs);
      });

      this.isRunning = true;
      logger.info('Auto-Fangwen应用初始化完成', {
        totalTasks: urlConfigs.length,
        enabledTasks: urlConfigs.filter(config => config.enabled).length,
        webPort: this.webServer.port
      });

    } catch (error) {
      logger.error('应用初始化失败', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * 重新加载配置
   */
  async reloadConfigs(newConfigs) {
    logger.info('正在重新加载配置...');

    try {
      // 停止所有现有任务
      this.scheduler.stop();

      // 重新添加任务
      for (const config of newConfigs) {
        try {
          this.scheduler.addUrlTask(config);
        } catch (error) {
          logger.error('重新添加URL任务失败', {
            id: config.id,
            error: error.message
          });
        }
      }

      // 重新启动调度器
      this.scheduler.start();

      logger.info('配置重新加载完成', {
        totalTasks: newConfigs.length,
        enabledTasks: newConfigs.filter(config => config.enabled).length
      });

    } catch (error) {
      logger.error('重新加载配置失败', { error: error.message });
    }
  }

  /**
   * 启动应用
   */
  async start() {
    try {
      await this.initialize();

      // 设置定时状态报告
      this.setupStatusReporting();

      // 处理优雅关闭
      this.setupGracefulShutdown();

      logger.info('Auto-Fangwen应用已启动，按 Ctrl+C 退出');

    } catch (error) {
      logger.error('应用启动失败', { error: error.message });
      process.exit(1);
    }
  }

  /**
   * 设置状态报告
   */
  setupStatusReporting() {
    // 每小时报告一次状态
    setInterval(() => {
      if (this.isRunning) {
        const status = this.scheduler.getTasksStatus();
        logger.info('任务状态报告', {
          timestamp: new Date().toISOString(),
          tasks: status
        });
      }
    }, 60 * 60 * 1000); // 1小时
  }

  /**
   * 设置优雅关闭
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`收到${signal}信号，正在优雅关闭应用...`);

      try {
        this.isRunning = false;
        this.scheduler.stop();
        this.webServer.stop();

        logger.info('Auto-Fangwen应用已关闭');
        process.exit(0);

      } catch (error) {
        logger.error('关闭应用时出错', { error: error.message });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
      logger.error('未捕获的异常', { error: error.message, stack: error.stack });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('未处理的Promise拒绝', {
        reason: reason.toString(),
        promise: promise.toString()
      });
    });
  }
}

// 如果直接运行此文件，启动应用
if (require.main === module) {
  const app = new AutoFangwenApp();
  app.start().catch(error => {
    console.error('启动应用失败:', error);
    process.exit(1);
  });
}

module.exports = AutoFangwenApp;