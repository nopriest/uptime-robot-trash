const logger = require('./logger');
const HttpClient = require('./httpClient');

class Scheduler {
  constructor() {
    this.httpClient = new HttpClient();
    this.timers = new Map(); // 存储所有的定时器
    this.urlConfigs = new Map(); // 存储URL配置
  }

  /**
   * 添加URL访问任务
   * @param {Object} config - URL配置
   * @param {string} config.id - 任务唯一标识
   * @param {string} config.url - 要访问的URL
   * @param {string} config.method - HTTP方法 (GET, POST, PUT, DELETE)
   * @param {Object} config.headers - 请求头
   * @param {Object} config.data - 请求数据
   * @param {number} config.intervalSeconds - 访问间隔（秒）
   * @param {number} config.randomRange - 随机延迟范围（秒）
   * @param {boolean} config.enabled - 是否启用
   */
  addUrlTask(config) {
    const {
      id,
      url,
      intervalSeconds,
      randomRange = 0,
      enabled = true,
      ...httpConfig
    } = config;

    if (!id || !url || !intervalSeconds) {
      throw new Error('任务配置缺少必要参数: id, url, intervalSeconds');
    }

    this.urlConfigs.set(id, config);

    if (enabled) {
      this._scheduleTask(id, config);
    }

    logger.info(`URL任务已添加: ${id}`, {
      id,
      url,
      interval: intervalSeconds,
      randomRange,
      enabled,
    });
  }

  /**
   * 调度单个任务
   * @private
   */
  _scheduleTask(id, config) {
    const { intervalSeconds, randomRange } = config;

    // 清除现有的定时器
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id));
    }

    // 创建独立的执行循环
    const executeTask = async () => {
      try {
        logger.info(`执行URL访问任务: ${id}`);
        await this._executeTask(id, config);
      } catch (error) {
        logger.error(`任务执行出错: ${id}`, { error: error.message, id });
      }

      // 计算下次执行时间
      const interval = intervalSeconds * 1000;
      let randomDelay = 0;
      if (randomRange > 0) {
        randomDelay = Math.floor(Math.random() * randomRange * 1000);
      }

      const nextExecutionTime = interval + randomDelay;

      // 调度下次执行
      const timer = setTimeout(executeTask, nextExecutionTime);
      this.timers.set(id, timer);
    };

    // 为每个任务添加不同的初始延迟，避免同时执行
    // 使用任务ID的哈希值来生成稳定的初始延迟
    const initialDelay = this._getInitialDelay(id, intervalSeconds);

    // 调度首次执行
    const timer = setTimeout(executeTask, initialDelay);
    this.timers.set(id, timer);

    logger.info(`任务已调度: ${id}`, {
      interval: intervalSeconds,
      randomRange,
      initialDelay,
    });
  }

  /**
   * 计算任务的初始延迟，避免所有任务同时开始
   * @private
   */
  _getInitialDelay(id, intervalSeconds) {
    // 使用简单的哈希函数基于任务ID生成延迟
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 转换为32位整数
    }

    // 确保延迟在0到intervalSeconds之间，并且分散开
    const delay = Math.abs(hash) % (intervalSeconds * 1000);
    return delay;
  }

  /**
   * 执行具体的URL访问任务
   * @private
   */
  async _executeTask(id, config) {
    const startTime = Date.now();

    try {
      const result = await this.httpClient.visitUrl(config);

      // 记录执行结果
      /*       logger.info(`任务执行完成: ${id}`, {
        id,
        success: result.success,
        status: result.status,
        statusCode: result.statusCode,
        duration: result.duration,
        error: result.error
      }) */ // 更新最后执行时间
      this._updateLastExecution(id);

      return result;
    } catch (error) {
      logger.error(`任务执行失败: ${id}`, {
        id,
        error: error.message,
        duration: Date.now() - startTime,
      });

      // 即使失败也要更新执行时间，避免连续失败时频繁重试
      this._updateLastExecution(id);

      throw error;
    }
  }

  /**
   * 获取任务最后执行时间
   * @private
   */
  _getLastExecution(id) {
    const key = `last_execution_${id}`;
    return parseInt(global[key] || '0');
  }

  /**
   * 更新任务最后执行时间
   * @private
   */
  _updateLastExecution(id) {
    const key = `last_execution_${id}`;
    global[key] = Date.now().toString();
  }

  /**
   * 启用任务
   */
  enableTask(id) {
    const config = this.urlConfigs.get(id);
    if (!config) {
      logger.warn(`任务不存在: ${id}`);
      return;
    }

    if (this.timers.has(id)) {
      logger.warn(`任务已经启用: ${id}`);
      return;
    }

    config.enabled = true;
    this._scheduleTask(id, config);
    logger.info(`任务已启用: ${id}`);
  }

  /**
   * 禁用任务
   */
  disableTask(id) {
    const timer = this.timers.get(id);
    if (!timer) {
      logger.warn(`任务不存在或未启用: ${id}`);
      const config = this.urlConfigs.get(id);
      if (config) {
        config.enabled = false;
      }
      return;
    }

    clearTimeout(timer);
    this.timers.delete(id);

    const config = this.urlConfigs.get(id);
    if (config) {
      config.enabled = false;
    }

    logger.info(`任务已禁用: ${id}`);
  }

  /**
   * 获取所有任务状态
   */
  getTasksStatus() {
    const status = {};

    for (const [id, config] of this.urlConfigs) {
      const lastExecution = this._getLastExecution(id);
      const isActive = this.timers.has(id);

      status[id] = {
        url: config.url,
        interval: config.intervalSeconds,
        randomRange: config.randomRange || 0,
        enabled: config.enabled,
        active: isActive,
        lastExecution:
          lastExecution > 0 ? new Date(lastExecution).toISOString() : null,
        nextExecution: this._calculateNextExecution(id, config),
      };
    }

    return status;
  }

  /**
   * 计算下次执行时间
   * @private
   */
  _calculateNextExecution(id, config) {
    const lastExecution = this._getLastExecution(id);
    if (lastExecution === 0) return null;

    const interval = config.intervalSeconds * 1000;
    const randomRange = (config.randomRange || 0) * 1000;

    const nextExecution =
      lastExecution + interval + Math.floor(Math.random() * randomRange);
    return new Date(nextExecution).toISOString();
  }

  /**
   * 启动调度器
   */
  start() {
    logger.info('URL访问调度器已启动');
  }

  /**
   * 停止调度器
   */
  stop() {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
    }
    this.timers.clear();
    logger.info('URL访问调度器已停止');
  }
}

module.exports = Scheduler;
