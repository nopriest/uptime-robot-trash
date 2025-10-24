# Render部署指南

## 快速部署到Render

### 方法1: 通过GitHub连接（推荐）

1. **准备代码仓库**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Auto-fangwen URL scheduler"
   git remote add origin https://github.com/your-username/auto-fangwen.git
   git push -u origin main
   ```

2. **创建Render Web Service**
   - 登录 [Render Dashboard](https://dashboard.render.com)
   - 点击 "New +" → "Web Service"
   - 连接您的GitHub仓库
   - 选择构建环境：Docker
   - 配置服务名称：auto-fangwen

3. **配置构建设置**
   - Build Context: `.`
   - Dockerfile Path: `./Dockerfile`
   - Root Directory: (留空)

4. **设置环境变量**
   ```
   NODE_ENV=production
   LOG_LEVEL=info
   CONFIG_PATH=/app/config/urls.json
   ```

5. **配置资源限制**
   - Free Plan: 512MB RAM, 0.1 CPU
   - Starter Plan: 1GB RAM, shared CPU

### 方法2: 使用render.yaml

1. **修改render.yaml**
   ```yaml
   services:
     - type: web
       name: auto-fangwen
       env: docker
       repo: https://github.com/your-username/auto-fangwen.git
       # ... 其他配置
   ```

2. **部署命令**
   ```bash
   # 安装Render CLI
   npm install -g @render/cli

   # 登录Render
   render login

   # 创建Blueprint
   render blueprint create
   ```

## Render特定配置

### Docker优化
- 使用轻量级Alpine基础镜像
- 多阶段构建减少镜像大小
- 非root用户运行
- 健康检查配置

### 环境变量配置
在Render控制台中设置：

| 变量名 | 建议值 | 说明 |
|--------|--------|------|
| `NODE_ENV` | production | 生产环境 |
| `LOG_LEVEL` | info | 日志级别 |
| `CONFIG_PATH` | /app/config/urls.json | 配置文件路径 |
| `PORT` | 3000 | Render自动设置 |

### 持久化存储
- 日志文件存储在临时目录（每次重启会丢失）
- 如需持久化，需要使用Render Disk:
  ```yaml
  disk:
     name: logs
     mountPath: /app/logs
     sizeGB: 1
  ```

### 监控和健康检查
- Render自动监控服务健康状态
- 健康检查失败时自动重启
- 可在Dashboard查看实时日志

## 配置文件管理

### 方案1: 构建时嵌入（简单）
配置文件直接打包到Docker镜像中

优点：
- 简单易用
- 无需额外配置

缺点：
- 修改配置需要重新部署

### 方案2: 环境变量覆盖（推荐）
使用Render的环境变量覆盖默认配置

```javascript
// config/configManager.js 中添加
const configFromEnv = {
  urls: process.env.URL_CONFIGS ?
    JSON.parse(process.env.URL_CONFIGS) :
    JSON.parse(fs.readFileSync(this.configPath, 'utf8')).urls
};
```

在Render中设置环境变量：
```bash
URL_CONFIGS=[{"id":"api1","url":"https://api.example.com","intervalSeconds":300,"enabled":true}]
```

### 方案3: 外部配置服务（高级）
使用外部配置管理服务（如AWS Parameter Store、HashiCorp Vault）

## 性能优化

### 资源使用优化
1. **内存管理**
   - 监控内存使用情况
   - 限制并发请求数量
   - 定期清理日志文件

2. **网络优化**
   - 使用HTTP连接池
   - 设置合理的超时时间
   - 启用请求压缩

3. **CPU优化**
   - 避免CPU密集型操作
   - 使用异步I/O
   - 合理设置定时任务间隔

### 扩展性考虑
- 支持水平扩展（多个实例）
- 使用Redis等外部存储共享状态
- 实现任务队列机制

## 故障排除

### 常见Render问题

1. **构建失败**
   ```bash
   # 检查Dockerfile语法
   docker build -t test .

   # 查看构建日志
   docker build --no-cache -t test .
   ```

2. **启动失败**
   ```bash
   # 查看应用日志
   docker logs <container-id>

   # 检查配置文件
   docker exec <container-id> cat /app/config/urls.json
   ```

3. **健康检查失败**
   - 确保应用正确响应健康检查
   - 检查端口配置（Render需要使用$PORT环境变量）
   - 检查防火墙设置

### 调试技巧

1. **启用调试日志**
   ```
   LOG_LEVEL=debug
   ```

2. **查看实时日志**
   ```bash
   # 在Render Dashboard中查看
   # 或使用Render CLI
   render logs auto-fangwen --tail
   ```

3. **本地测试Render配置**
   ```bash
   # 模拟Render环境
   docker run -e NODE_ENV=production -e PORT=3000 auto-fangwen
   ```

## 成本优化

### 免费方案限制
- 512MB RAM
- 0.1 CPU
- 750小时/月
- 自动休眠（15分钟无访问）

### 优化建议
1. **减少资源使用**
   - 优化内存分配
   - 避免内存泄漏
   - 使用流式处理

2. **避免自动休眠**
   - 配置外部ping服务
   - 设置更短的访问间隔
   - 使用Render的Cron Job定时唤醒

3. **监控成本**
   - 设置使用量告警
   - 定期检查资源使用情况
   - 优化不必要的功能