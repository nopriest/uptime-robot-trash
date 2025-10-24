# Auto-Fangwen

一个基于Node.js的定时URL访问工具，支持Docker容器化部署，专为Render平台优化。

## 功能特性

- 🕐 **灵活调度**: 支持自定义访问间隔和随机延迟
- 🔧 **配置化**: JSON配置文件支持热重载
- 🐳 **容器化**: 完整的Docker支持
- 📊 **日志记录**: 结构化日志和错误追踪
- 🛡️ **安全可靠**: 非root用户运行，优雅关闭
- 🌐 **Render优化**: 专为Render云平台部署优化

## 快速开始

### 1. 克隆项目

```bash
git clone <repository-url>
cd auto-fangwen
```

### 2. 配置URL

编辑 `config/urls.json` 文件：

```json
{
  "urls": [
    {
      "id": "my-api-1",
      "url": "https://api.example.com/heartbeat",
      "method": "GET",
      "intervalSeconds": 300,
      "randomRange": 60,
      "enabled": true,
      "headers": {
        "Authorization": "Bearer your-token",
        "Content-Type": "application/json"
      }
    }
  ]
}
```

### 3. 本地运行

```bash
# 安装依赖
npm install

# 启动应用
npm start
```

### 4. Docker运行

```bash
# 构建镜像
docker build -t auto-fangwen .

# 运行容器
docker run -d \
  --name auto-fangwen \
  -v $(pwd)/config/urls.json:/app/config/urls.json:ro \
  -v $(pwd)/logs:/app/logs \
  auto-fangwen
```

## 配置说明

### URL配置参数

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 任务唯一标识 |
| `url` | string | 是 | 要访问的URL |
| `method` | string | 否 | HTTP方法 (默认: GET) |
| `intervalSeconds` | number | 是 | 访问间隔（秒） |
| `randomRange` | number | 否 | 随机延迟范围（秒） |
| `enabled` | boolean | 否 | 是否启用 (默认: true) |
| `headers` | object | 否 | 请求头 |
| `data` | object | 否 | 请求数据 |
| `timeout` | number | 否 | 请求超时时间（毫秒） |

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NODE_ENV` | production | 运行环境 |
| `LOG_LEVEL` | info | 日志级别 (debug, info, warn, error) |
| `CONFIG_PATH` | /app/config/urls.json | 配置文件路径 |

## Render部署

### 1. 准备部署

1. 将代码推送到GitHub仓库
2. 在Render控制台创建新的Web Service
3. 连接GitHub仓库

### 2. 配置Render

**构建设置:**
- Build Command: `docker build -t auto-fangwen .`
- Start Command: `docker run -p $PORT:3000 auto-fangwen`

**环境变量:**
```
NODE_ENV=production
LOG_LEVEL=info
CONFIG_PATH=/app/config/urls.json
```

**Dockerfile:**
确保使用项目根目录下的`Dockerfile`

### 3. 自定义域名配置

在Render的Web Service设置中：
1. 进入Custom Domains选项
2. 添加您的自定义域名
3. 按照Render的指引配置DNS记录

## 监控和日志

### 查看实时日志

```bash
# Docker容器日志
docker logs -f auto-fangwen

# 应用日志文件
tail -f logs/combined.log

# 错误日志
tail -f logs/error.log
```

### 日志格式

日志采用JSON格式，包含以下字段：
- `timestamp`: 时间戳
- `level`: 日志级别
- `message`: 日志消息
- `meta`: 额外元数据（如URL、状态码、响应时间等）

### 任务状态

应用会每小时输出一次任务状态报告，包含：
- 任务总数
- 启用任务数
- 每个任务的最后执行时间
- 下次执行时间预估

## 高级配置

### 模板变量

在请求数据中可以使用模板变量：

```json
{
  "data": {
    "timestamp": "{{current_time}}",
    "source": "auto-fangwen"
  }
}
```

### 请求头配置

支持自定义请求头：

```json
{
  "headers": {
    "User-Agent": "MyBot/1.0",
    "Authorization": "Bearer token",
    "X-Custom-Header": "value"
  }
}
```

## 故障排除

### 常见问题

1. **任务不执行**
   - 检查配置文件格式是否正确
   - 确认enabled设置为true
   - 查看日志文件中的错误信息

2. **请求失败**
   - 验证URL是否可访问
   - 检查网络连接
   - 确认认证信息是否正确

3. **内存泄漏**
   - 监控容器资源使用情况
   - 检查日志文件大小
   - 考虑增加日志轮转配置

### 调试模式

设置环境变量启用调试：

```bash
LOG_LEVEL=debug npm start
```

## 贡献

欢迎提交Issue和Pull Request来改进这个项目。

## 许可证

MIT License