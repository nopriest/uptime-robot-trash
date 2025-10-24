const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const logger = require('./logger');
const ConfigManager = require('../config/configManager');

class WebServer {
  constructor(scheduler) {
    this.app = express();
    this.scheduler = scheduler;
    this.configManager = new ConfigManager();
    this.port = process.env.WEB_PORT || process.env.PORT || 8003;
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * 设置中间件
   */
  setupMiddleware() {
    // 安全中间件 - 允许内联脚本用于前端功能
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          imgSrc: ["'self'", "data:"]
        }
      }
    }));

    // CORS支持
    this.app.use(cors());

    // 请求体解析
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Session配置
    this.app.use(session({
      name: 'auto-fangwen-session',
      secret: process.env.SESSION_SECRET || 'auto-fangwen-secret-key-change-in-production',
      resave: false,
      saveUninitialized: false,
      cookie: {
        // 只有在明确启用HTTPS时才设置secure，否则允许HTTP
        secure: process.env.FORCE_HTTPS === 'true',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24小时
        sameSite: 'lax', // 防止CSRF攻击，同时允许正常的GET导航
        path: '/' // 明确指定cookie路径
      }
    }));

    // 静态文件服务
    this.app.use('/static', express.static(path.join(__dirname, '../public')));
    this.app.use(express.static(path.join(__dirname, '../public')));

    // 请求日志 - 排除频繁的API请求
    this.app.use((req, res, next) => {
      // 排除日志API和健康检查API的频繁请求
      const excludePaths = ['/api/logs', '/api/health'];
      const shouldLog = !excludePaths.some(path => req.url.startsWith(path));
      
      if (shouldLog) {
        logger.info('HTTP请求', {
          method: req.method,
          url: req.url,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      }
      next();
    });
  }

  /**
   * 设置路由
   */
  setupRoutes() {
    // 身份验证中间件
    const requireAuth = (req, res, next) => {
      if (req.session.isAuthenticated) {
        return next();
      }
      res.status(401).json({ error: '未授权访问' });
    };

    // 主页 - 登录页面或管理界面
    this.app.get('/', (req, res) => {
      if (req.session.isAuthenticated) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
      } else {
        res.sendFile(path.join(__dirname, '../public/login.html'));
      }
    });

    // 登录API
    this.app.post('/api/auth/login', async (req, res) => {
      try {
        const { password } = req.body;

        if (!password) {
          return res.status(400).json({ error: '密码不能为空' });
        }

        // 优先使用环境变量中的密码，否则使用配置文件中的密码
        const adminPassword = process.env.ADMIN_PASSWORD || this.configManager.loadConfig().adminPassword;

        if (!adminPassword) {
          return res.status(500).json({ error: '管理员密码未配置' });
        }

        let passwordMatch = false;

        // 检查是否为bcrypt哈希
        if (adminPassword.startsWith('$2') && adminPassword.length === 60) {
          passwordMatch = await bcrypt.compare(password, adminPassword);
        } else {
          // 明文密码比较（向后兼容）
          passwordMatch = password === adminPassword;
        }

        if (passwordMatch) {
          req.session.isAuthenticated = true;
          req.session.loginTime = Date.now();

          logger.info('用户登录成功', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });

          res.json({ success: true, message: '登录成功' });
        } else {
          logger.warn('用户登录失败', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });

          res.status(401).json({ error: '密码错误' });
        }

      } catch (error) {
        logger.error('登录处理失败', { error: error.message });
        res.status(500).json({ error: '登录处理失败' });
      }
    });

    // 登出API
    this.app.post('/api/auth/logout', (req, res) => {
      req.session.destroy((err) => {
        if (err) {
          logger.error('登出失败', { error: err.message });
          res.status(500).json({ error: '登出失败' });
        } else {
          res.json({ success: true, message: '登出成功' });
        }
      });
    });

    // 检查认证状态API
    this.app.get('/api/auth/status', (req, res) => {
      res.json({
        authenticated: !!req.session.isAuthenticated,
        loginTime: req.session.loginTime || null
      });
    });

    // 获取URL配置列表API
    this.app.get('/api/config/urls', requireAuth, (req, res) => {
      try {
        const urlConfigs = this.configManager.getProcessedUrlConfigs();
        res.json({ urls: urlConfigs });
      } catch (error) {
        logger.error('获取URL配置失败', { error: error.message });
        res.status(500).json({ error: '获取URL配置失败' });
      }
    });

    // 保存URL配置API
    this.app.post('/api/config/urls', requireAuth, async (req, res) => {
      try {
        const { urls } = req.body;

        if (!Array.isArray(urls)) {
          return res.status(400).json({ error: 'URL配置必须是数组格式' });
        }

        // 验证每个URL配置
        for (const config of urls) {
          this.configManager.validateUrlConfig(config);
        }

        // 读取当前配置
        const currentConfig = this.configManager.loadConfig();
        currentConfig.urls = urls;

        // 保存配置
        const fs = require('fs');
        fs.writeFileSync(
          this.configManager.configPath,
          JSON.stringify(currentConfig, null, 2),
          'utf8'
        );

        // 重新加载调度器配置
        await this.reloadScheduler();

        logger.info('URL配置已更新', {
          count: urls.length,
          ip: req.ip
        });

        res.json({ success: true, message: '配置保存成功' });

      } catch (error) {
        logger.error('保存URL配置失败', { error: error.message });
        res.status(400).json({ error: error.message });
      }
    });

    // 获取任务状态API
    this.app.get('/api/tasks/status', requireAuth, (req, res) => {
      try {
        const status = this.scheduler.getTasksStatus();
        res.json({ tasks: status });
      } catch (error) {
        logger.error('获取任务状态失败', { error: error.message });
        res.status(500).json({ error: '获取任务状态失败' });
      }
    });

    // 启用/禁用任务API
    this.app.post('/api/tasks/:id/toggle', requireAuth, async (req, res) => {
      try {
        const { id } = req.params;
        const { enabled } = req.body;

        console.log('Toggle API called:', { id, enabled }); // 调试信息

        // 读取当前配置
        const currentConfig = this.configManager.loadConfig();
        const urlIndex = currentConfig.urls.findIndex(url => url.id === id);
        
        console.log('URL index found:', urlIndex); // 调试信息
        
        if (urlIndex === -1) {
          console.log('URL not found:', id); // 调试信息
          return res.status(404).json({ error: 'URL配置不存在' });
        }

        // 更新配置中的启用状态
        currentConfig.urls[urlIndex].enabled = enabled;

        // 保存配置到文件
        const fs = require('fs');
        fs.writeFileSync(
          this.configManager.configPath,
          JSON.stringify(currentConfig, null, 2),
          'utf8'
        );

        console.log('Config saved, updating scheduler...'); // 调试信息

        // 更新调度器中的任务状态
        if (enabled) {
          this.scheduler.enableTask(id);
        } else {
          this.scheduler.disableTask(id);
        }

        console.log('Scheduler updated, sending response'); // 调试信息

        logger.info('任务状态已切换', { id, enabled, ip: req.ip });
        res.json({ success: true, message: `任务已${enabled ? '启用' : '禁用'}` });

      } catch (error) {
        console.error('Toggle API error:', error); // 调试信息
        logger.error('切换任务状态失败', { error: error.message });
        res.status(500).json({ error: '操作失败' });
      }
    });

    // 获取日志API
    this.app.get('/api/logs', requireAuth, (req, res) => {
      try {
        const { type = 'combined', lines = 100 } = req.query;
        const fs = require('fs');
        const path = require('path');

        const logFile = path.join(__dirname, '../logs', `${type}.log`);

        if (!fs.existsSync(logFile)) {
          return res.json({ logs: [] });
        }

        const content = fs.readFileSync(logFile, 'utf8');
        const logLines = content.trim().split('\n').filter(line => line.trim());

        // 返回最后N行
        const recentLogs = logLines.slice(-lines);

        res.json({ logs: recentLogs });

      } catch (error) {
        logger.error('获取日志失败', { error: error.message });
        res.status(500).json({ error: '获取日志失败' });
      }
    });

    // 清空日志API
    this.app.delete('/api/logs/clear', requireAuth, (req, res) => {
      try {
        const fs = require('fs');
        const path = require('path');

        // 只清空实际存在的日志文件类型
        const logTypes = ['combined', 'error'];
        const logDir = path.join(__dirname, '../logs');

        // 确保日志目录存在
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }

        // 清空各种类型的日志文件
        let clearedFiles = [];
        logTypes.forEach(type => {
          const logFile = path.join(logDir, `${type}.log`);
          if (fs.existsSync(logFile)) {
            fs.writeFileSync(logFile, '', 'utf8');
            clearedFiles.push(`${type}.log`);
          }
        });

        logger.info('日志已清空', {
          ip: req.ip,
          clearedFiles: clearedFiles
        });

        res.json({ success: true, message: '日志清空成功' });

      } catch (error) {
        logger.error('清空日志失败', { error: error.message });
        res.status(500).json({ error: '清空日志失败' });
      }
    });

    // 健康检查API
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        tasks: Object.keys(this.scheduler.getTasksStatus()).length
      });
    });

    // 404处理
    this.app.use('*', (req, res) => {
      if (req.session.isAuthenticated) {
        res.status(404).json({ error: '页面不存在' });
      } else {
        res.status(404).send('页面不存在');
      }
    });

    // 错误处理中间件
    this.app.use((err, req, res, next) => {
      logger.error('Web服务器错误', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
      });

      if (req.session.isAuthenticated) {
        res.status(500).json({ error: '服务器内部错误' });
      } else {
        res.status(500).send('服务器内部错误');
      }
    });
  }

  /**
   * 重新加载调度器配置
   */
  async reloadScheduler() {
    try {
      const newConfigs = this.configManager.getProcessedUrlConfigs();

      // 停止所有现有任务
      this.scheduler.stop();

      // 重新添加任务
      for (const config of newConfigs) {
        this.scheduler.addUrlTask(config);
      }

      // 重新启动调度器
      this.scheduler.start();

      logger.info('调度器配置已重新加载', {
        totalTasks: newConfigs.length,
        enabledTasks: newConfigs.filter(config => config.enabled).length
      });

    } catch (error) {
      logger.error('重新加载调度器失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 启动Web服务器
   */
  start() {
    this.app.listen(this.port, () => {
      logger.info('Web服务器已启动', {
        port: this.port,
        env: process.env.NODE_ENV || 'development'
      });
    });
  }

  /**
   * 停止Web服务器
   */
  stop() {
    logger.info('Web服务器已停止');
  }
}

module.exports = WebServer;