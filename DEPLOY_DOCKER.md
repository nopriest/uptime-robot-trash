# Docker 部署指南

本文档详细介绍如何在VPS上使用Docker部署Auto-Fangwen项目。

## 前置要求

- VPS服务器（推荐Ubuntu 20.04+或CentOS 8+）
- 已安装Docker和Docker Compose
- 至少512MB RAM，1GB存储空间
- 具有sudo权限的用户账户

## 第一步：安装Docker和Docker Compose

### Ubuntu/Debian系统

```bash
# 更新包索引
sudo apt update

# 安装必要的包
sudo apt install -y apt-transport-https ca-certificates curl gnupg lsb-release

# 添加Docker官方GPG密钥
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# 添加Docker仓库
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装Docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 启动Docker服务
sudo systemctl start docker
sudo systemctl enable docker

# 将当前用户添加到docker组（可选，避免每次使用sudo）
sudo usermod -aG docker $USER
```

### CentOS/RHEL系统

```bash
# 安装必要的包
sudo yum install -y yum-utils

# 添加Docker仓库
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

# 安装Docker
sudo yum install -y docker-ce docker-ce-cli containerd.io

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 启动Docker服务
sudo systemctl start docker
sudo systemctl enable docker

# 将当前用户添加到docker组
sudo usermod -aG docker $USER
```

## 第二步：获取项目代码

```bash
# 克隆项目（如果有Git仓库）
git clone <your-repo-url> auto-fangwen
cd auto-fangwen

# 或者直接上传项目文件到服务器
# 使用scp或sftp上传整个项目文件夹
```

## 第三步：配置项目

### 1. 修改配置文件

编辑 `config/urls.json` 文件，配置你要定时访问的URL：

```bash
nano config/urls.json
```

示例配置：
```json
{
  "adminPassword": "your-secure-password",
  "urls": [
    {
      "id": "health-check",
      "url": "https://httpbin.org/status/200",
      "method": "GET",
      "intervalSeconds": 120,
      "randomRange": 0,
      "enabled": true
    },
    {
      "id": "my-api",
      "url": "https://your-api.com/heartbeat",
      "method": "POST",
      "intervalSeconds": 300,
      "randomRange": 60,
      "enabled": true,
      "headers": {
        "Content-Type": "application/json",
        "Authorization": "Bearer your-token"
      },
      "data": {
        "source": "auto-fangwen"
      }
    }
  ]
}
```

### 2. 创建必要的目录

```bash
# 创建日志目录
mkdir -p logs

# 设置权限
chmod 755 logs
```

## 第四步：构建和运行容器

### 方法一：使用Docker Compose（推荐）

```bash
# 构建并启动容器
docker-compose up -d

# 查看容器状态
docker-compose ps

# 查看日志
docker-compose logs -f auto-fangwen
```

### 方法二：使用Docker命令

```bash
# 构建镜像
docker build -t auto-fangwen .

# 运行容器
docker run -d \
  --name auto-fangwen \
  --restart unless-stopped \
  -p 8003:8003 \
  -v $(pwd)/config/urls.json:/app/config/urls.json:ro \
  -v $(pwd)/logs:/app/logs \
  -e NODE_ENV=production \
  -e LOG_LEVEL=info \
  auto-fangwen
```

## 第五步：配置防火墙

### Ubuntu (UFW)

```bash
# 允许8003端口
sudo ufw allow 8003

# 启用防火墙（如果尚未启用）
sudo ufw enable
```

### CentOS (firewalld)

```bash
# 允许8003端口
sudo firewall-cmd --permanent --add-port=8003/tcp
sudo firewall-cmd --reload
```

## 第六步：验证部署

1. **检查容器状态**：
```bash
docker ps | grep auto-fangwen
```

2. **检查健康状态**：
```bash
curl http://localhost:8003/api/health
```

3. **访问Web界面**：
打开浏览器访问 `http://your-vps-ip:8003`

4. **查看日志**：
```bash
# 实时查看容器日志
docker logs -f auto-fangwen

# 查看应用日志文件
tail -f logs/combined.log
```

## 第七步：配置反向代理（可选）

### 使用Nginx

1. 安装Nginx：
```bash
sudo apt install nginx  # Ubuntu
# 或
sudo yum install nginx  # CentOS
```

2. 创建配置文件：
```bash
sudo nano /etc/nginx/sites-available/auto-fangwen
```

3. 添加以下配置：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或IP

    location / {
        proxy_pass http://localhost:8003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. 启用站点：
```bash
sudo ln -s /etc/nginx/sites-available/auto-fangwen /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 配置SSL（使用Let's Encrypt）

```bash
# 安装Certbot
sudo apt install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com

# 设置自动续期
sudo crontab -e
# 添加以下行：
# 0 12 * * * /usr/bin/certbot renew --quiet
```

## 第八步：监控和维护

### 1. 设置自动重启

Docker Compose已经配置了 `restart: unless-stopped`，容器会在系统重启后自动启动。

### 2. 日志轮转

创建logrotate配置：
```bash
sudo nano /etc/logrotate.d/auto-fangwen
```

添加内容：
```
/path/to/auto-fangwen/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker restart auto-fangwen
    endscript
}
```

### 3. 备份配置

创建备份脚本：
```bash
nano backup.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/backup/auto-fangwen"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份配置文件
cp config/urls.json $BACKUP_DIR/urls_$DATE.json

# 备份最近的日志
cp logs/combined.log $BACKUP_DIR/combined_$DATE.log

# 删除7天前的备份
find $BACKUP_DIR -name "*.json" -mtime +7 -delete
find $BACKUP_DIR -name "*.log" -mtime +7 -delete

echo "备份完成: $DATE"
```

设置定时备份：
```bash
chmod +x backup.sh
crontab -e
# 添加每天凌晨2点备份：
# 0 2 * * * /path/to/auto-fangwen/backup.sh
```

## 故障排除

### 常见问题

1. **容器无法启动**：
```bash
# 查看详细错误信息
docker-compose logs auto-fangwen

# 检查配置文件语法
cat config/urls.json | python3 -m json.tool
```

2. **端口被占用**：
```bash
# 查看端口占用情况
sudo netstat -tlnp | grep 8003

# 修改docker-compose.yml中的端口映射
ports:
  - "8080:8003"  # 改为其他端口
```

3. **权限问题**：
```bash
# 修复日志目录权限
sudo chown -R 1001:1001 logs/
sudo chmod -R 755 logs/
```

4. **内存不足**：
```bash
# 查看系统资源使用情况
docker stats
free -h

# 增加swap空间（如果需要）
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

5. **登录时HTTPS重定向问题**：
```bash
# 问题现象：访问HTTP登录页面时，登录请求被重定向到HTTPS
# 解决方案：确保FORCE_HTTPS环境变量设置正确

# 检查当前环境变量设置
docker-compose exec auto-fangwen env | grep FORCE_HTTPS

# 如果需要HTTP访问，确保docker-compose.yml中设置：
environment:
  - FORCE_HTTPS=false

# 如果需要HTTPS访问，需要：
# 1. 设置 FORCE_HTTPS=true
# 2. 配置SSL证书和反向代理
# 3. 确保反向代理正确处理HTTPS头信息
```

### 更新部署

```bash
# 停止容器
docker-compose down

# 拉取最新代码
git pull  # 或重新上传文件

# 重新构建并启动
docker-compose up -d --build

# 查看更新后的状态
docker-compose ps
```

## 安全建议

1. **修改默认密码**：在 `config/urls.json` 中设置强密码
2. **使用HTTPS**：配置SSL证书
3. **限制访问**：使用防火墙限制IP访问
4. **定期更新**：保持Docker和系统更新
5. **监控日志**：定期检查异常访问

## 性能优化

1. **调整Docker资源限制**：
```yaml
# 在docker-compose.yml中添加
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
```

2. **优化日志级别**：
```yaml
environment:
  - LOG_LEVEL=warn  # 减少日志输出
```

3. **使用SSD存储**：提高I/O性能

## 联系支持

如果遇到问题，请检查：
1. 容器日志：`docker-compose logs auto-fangwen`
2. 系统日志：`sudo journalctl -u docker`
3. 网络连接：`curl -I http://localhost:8003`

---

**注意**：请根据你的实际VPS环境和需求调整上述配置。