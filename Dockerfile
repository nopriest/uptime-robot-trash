# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 复制package.json和package-lock.json
COPY package*.json ./

# 安装依赖（仅生产依赖）
RUN npm ci --only=production && \
    npm cache clean --force

# 复制应用代码
COPY src/ ./src/
COPY config/ ./config/
COPY public/ ./public/

# 创建必要的目录并设置权限
RUN mkdir -p /app/logs /app/public && \
    chown -R nodejs:nodejs /app && \
    chmod -R 755 /app/logs

# 切换到非root用户
USER nodejs

# 暴露端口
EXPOSE 8003

# 设置环境变量
ENV NODE_ENV=production
ENV LOG_LEVEL=info
ENV CONFIG_PATH=/app/config/urls.json

# 健康检查（使用应用的健康检查端点）
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8003/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# 启动应用
CMD ["npm", "start"]