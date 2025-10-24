const axios = require('axios');
const logger = require('./logger');

class HttpClient {
  constructor() {
    // 创建axios实例，设置默认配置
    this.client = axios.create({
      timeout: 30000, // 30秒超时
      validateStatus: function (status) {
        return status < 500; // 只有5xx错误才视为请求失败
      }
    });
  }

  /**
   * 访问指定URL
   * @param {Object} config - 访问配置
   * @param {string} config.url - 要访问的URL
   * @param {string} config.method - HTTP方法 (GET, POST, PUT, DELETE)
   * @param {Object} config.headers - 请求头
   * @param {Object} config.data - 请求数据
   * @param {number} config.timeout - 请求超时时间
   */
  async visitUrl(config) {
    const startTime = Date.now();
    const { url, method = 'GET', headers = {}, data, timeout } = config;

    try {
      logger.info(`开始访问URL: ${method} ${url}`, {
        url,
        method,
        headers: this._sanitizeHeaders(headers),
        hasData: !!data
      });

      const requestConfig = {
        method,
        url,
        headers: {
          'User-Agent': 'Auto-Fangwen/1.0.0 (Scheduled Visit Bot)',
          ...headers
        },
        timeout: timeout || 30000
      };

      // 添加请求数据（对于POST、PUT等方法）
      if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
        requestConfig.data = data;
      }

      const response = await this.client(requestConfig);
      const duration = Date.now() - startTime;

      // 记录成功访问
      logger.info(`URL访问成功: ${method} ${url}`, {
        url,
        method,
        statusCode: response.status,
        statusText: response.statusText,
        duration: `${duration}ms`,
        responseSize: JSON.stringify(response.data).length
      });

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
        duration
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      // 记录错误详情
      logger.error(`URL访问失败: ${method} ${url}`, {
        url,
        method,
        error: error.message,
        code: error.code,
        statusCode: error.response?.status,
        duration: `${duration}ms`
      });

      return {
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.response?.status,
        duration
      };
    }
  }

  /**
   * 清理敏感的请求头信息，避免在日志中泄露
   * @private
   */
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];

    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '***';
      }
    });

    return sanitized;
  }
}

module.exports = HttpClient;