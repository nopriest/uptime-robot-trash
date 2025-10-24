# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Auto-Fangwen 是一个基于 Node.js 的定时 URL 访问工具，专为 Cloudflare Workers 和其他在线服务的健康监控而设计。项目采用容器化架构，支持 Docker 部署，并提供 Web 管理界面。

## 核心架构

### 应用架构
- **主应用类**: `AutoFangwenApp` (src/index.js:9) - 应用的核心控制器
- **调度器**: `Scheduler` (src/scheduler.js:4) - 管理定时任务和 URL 访问调度
- **HTTP 客户端**: `HttpClient` (src/httpClient.js) - 处理 HTTP 请求和响应
- **日志系统**: `Logger` (src/logger.js) - 结构化日志记录和管理
- **Web 服务器**: `WebServer` (src/webServer.js) - 提供管理界面和 API
- **配置管理**: `ConfigManager` (config/configManager.js) - 处理配置文件加载和热重载

### 关键设计模式
- **事件驱动**: 使用定时器和事件监听实现异步任务调度
- **配置热重载**: 支持运行时配置文件变更，无需重启应用
- **优雅关闭**: 实现 SIGTERM/SIGINT 信号处理和资源清理
- **模块化设计**: 各组件职责明确，便于维护和扩展

## 开发命令

### 本地开发
```bash
# 安装依赖
npm install

# 开发模式运行（支持文件监听）
npm run dev

# 生产模式运行
npm start
```

### Docker 开发
```bash
# 构建镜像
docker build -t auto-fangwen .

# 运行容器
docker run -d --name auto-fangwen -p 8003:8003 auto-fangwen

# 使用 Docker Compose
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## 配置系统

### 主配置文件
- **位置**: `config/urls.json`
- **格式**: JSON 数组，包含 URL 任务配置和管理员密码
- **热重载**: 支持文件变更时自动重新加载配置

### URL 任务配置结构
```json
{
  "id": "unique-task-id",
  "url": "https://example.com/api",
  "method": "GET|POST|PUT|DELETE",
  "intervalSeconds": 300,
  "randomRange": 30,
  "enabled": true,
  "headers": {},
  "data": {},
  "timeout": 10000
}
```

### 环境变量
- `NODE_ENV`: 运行环境 (development/production)
- `LOG_LEVEL`: 日志级别 (debug/info/warn/error)
- `CONFIG_PATH`: 配置文件路径
- `SESSION_SECRET`: Web 界面会话密钥

## Web 管理界面

### 功能特性
- **端口**: 8003
- **认证**: 基本表单认证，使用配置文件中的 `adminPassword`
- **功能**: 任务管理、状态监控、日志查看、配置编辑

### 页面结构
- `public/index.html`: 主管理界面
- `public/login.html`: 登录页面
- `src/webServer.js`: 路由和 API 端点实现

## 日志系统

### 日志类型
- **应用日志**: `logs/combined.log`
- **错误日志**: `logs/error.log`
- **控制台输出**: JSON 格式结构化日志

### 日志功能
- **自动清理**: 启动时和每 5 小时自动清理旧日志
- **结构化**: 包含时间戳、级别、消息和元数据
- **状态报告**: 每小时输出任务执行状态

## 部署注意事项

### 生产环境
- 使用非 root 用户运行 (Dockerfile:8-9)
- 健康检查端点: `/api/health`
- 资源限制: 512MB 内存, 0.5 CPU 核心
- 优雅关闭处理

### Render 平台部署
- 使用 Docker 构建和运行
- 端口通过 `$PORT` 环境变量动态配置
- 支持自定义域名和 SSL 证书

## 代码维护要点

### 核心文件
- `src/index.js`: 应用启动和生命周期管理
- `src/scheduler.js`: 定时任务调度逻辑
- `src/webServer.js`: Web 界面和 API 实现
- `config/configManager.js`: 配置文件处理

### 安全考虑
- 密码存储在配置文件中
- 使用 helmet 中间件增强安全性
- 非 root 用户运行容器
- 会话管理和超时处理

### 扩展指南
- 添加新的 HTTP 方法支持需修改 `HttpClient`
- 新增任务类型需扩展 `Scheduler` 类
- Web 界面功能增强需修改 `WebServer` 和前端页面