/**
 * 校园AI助手「小贸」- 主服务器文件
 *
 * 功能概述：
 * - Express HTTP服务器
 * - CORS跨域配置
 * - JSON请求体解析
 * - 静态文件服务
 * - API路由挂载（AI对话、校园功能）
 * - 全局错误处理
 */

require('dotenv').config(); // 加载环境变量

const express = require('express');
const cors = require('cors');
const path = require('path');

// 导入路由模块
const chatRoutes = require('./routes/chat');
const campusRoutes = require('./routes/campus');
const eduRoutes = require('./routes/edu');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const notesRoutes = require('./routes/notes');
// const emptyRoomsRoutes = require('./routes/empty-rooms');

// 导入错误处理中间件
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

// ==================== 创建Express应用 ====================
const app = express();
const PORT = process.env.PORT || 3001;

// ==================== 中间件配置 ====================

// CORS跨域配置 - 允许前端开发服务器和App访问
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true // 允许携带cookie
}));

// JSON请求体解析中间件
app.use(express.json({ limit: '10mb' })); // 限制请求体大小为10MB

// URL编码请求体解析
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 请求日志中间件（简易版）
app.use((req, res, next) => {
  const start = Date.now();
  // 响应完成后记录日志
  res.on('finish', () => {
    const duration = Date.now() - start;
    // 不记录SSE流式请求的完成日志（避免刷屏）
    if (req.originalUrl.includes('/stream')) return;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ==================== 静态文件服务 ====================
// 提供public目录下的静态文件
app.use(express.static(path.join(__dirname, 'public')));

// ==================== 奖学金名单 API ====================
const fs = require('fs');
const scholarshipData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'data/scholarship-2025-2026-1.json'), 'utf-8')
);

app.get('/api/scholarship/list', (req, res) => {
  try {
    const { college, grade, level, search, page = 1, pageSize = 50 } = req.query;
    let filtered = [...scholarshipData];

    if (college) filtered = filtered.filter(s => s['学院名称'] === college);
    if (grade) filtered = filtered.filter(s => s['年级'] === grade);
    if (level) filtered = filtered.filter(s => s['奖学金等级'] === level);
    if (search) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(s =>
        s['姓名'].toLowerCase().includes(q) || s['学号'].includes(q)
      );
    }

    const total = filtered.length;
    const start = (parseInt(page) - 1) * parseInt(pageSize);
    const paged = filtered.slice(start, start + parseInt(pageSize));

    res.json({
      success: true,
      data: {
        list: paged,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / parseInt(pageSize)),
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/scholarship/filters', (req, res) => {
  res.json({
    success: true,
    data: {
      colleges: [...new Set(scholarshipData.map(s => s['学院名称']))].sort(),
      grades: [...new Set(scholarshipData.map(s => s['年级']))].sort(),
      levels: [...new Set(scholarshipData.map(s => s['奖学金等级']))].sort(),
      total: scholarshipData.length,
    }
  });
});

// ==================== API路由挂载 ====================

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    data: {
      name: '小贸 - 校园AI助手',
      version: '1.0.0',
      status: 'running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

// 根路径欢迎信息
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: '欢迎使用小贸校园AI助手API',
    endpoints: {
      health: 'GET /api/health',
      chat: {
        send: 'POST /api/chat - 发送AI对话消息',
        streamGet: 'GET /api/chat/stream?query=xxx - SSE流式对话（GET）',
        streamPost: 'POST /api/chat/stream - SSE流式对话（POST）'
      },
      campus: {
        map: 'GET /api/campus/map - 校园地图数据',
        schedule: 'GET /api/campus/schedule?day=1 - 课表查询',
        scheduleToday: 'GET /api/campus/schedule/today - 今日课表',
        grades: 'GET /api/campus/grades - 成绩查询',
        library: 'GET /api/campus/library - 图书馆借阅信息',
        news: 'GET /api/campus/news - 校园资讯',
        services: 'GET /api/campus/services - 校园服务'
      }
    }
  });
});

// AI对话路由
app.use('/api', chatRoutes);

// 校园功能路由
app.use('/api', campusRoutes);

// 教务系统集成路由
app.use('/api', eduRoutes);

// 用户系统路由
app.use('/api', userRoutes);
app.use('/api', notesRoutes);

// 管理员路由放最后（避免全局中间件拦截普通请求）
app.use('/api', adminRoutes);

// 空教室路由
// app.use('/api', emptyRoomsRoutes);

// ==================== SPA 路由回退 ====================
// 所有非 API 的 GET 请求都返回 index.html，让 React Router 处理前端路由
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== 错误处理 ====================

// 404未找到处理（放在所有路由之后）
app.use(notFoundHandler);

// 全局错误处理中间件（必须放在最后）
app.use(errorHandler);

// ==================== 启动服务器 ====================

// 初始化数据库
const db = require('./services/database');
db.init();
console.log('[DB] 数据库初始化完成');

// 初始化新闻爬虫定时任务
const newsCrawler = require('./services/news-crawler');
newsCrawler.startCron();
console.log('[News] 新闻爬虫已启动，每30分钟更新一次');

app.listen(PORT, () => {
  console.log('========================================');
  console.log('  小贸 - 校园AI助手后端服务');
  console.log('========================================');
  console.log(`  服务地址: http://localhost:${PORT}`);
  console.log(`  API文档:  http://localhost:${PORT}/api`);
  console.log(`  环境:     ${process.env.NODE_ENV || 'development'}`);
  console.log(`  HiAgent:  ${process.env.HIAGENT_API_BASE || '未配置'}`);
  console.log('========================================');
});

// 优雅退出处理
process.on('SIGTERM', () => {
  console.log('[Server] 收到SIGTERM信号，正在关闭服务器...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Server] 收到SIGINT信号，正在关闭服务器...');
  process.exit(0);
});

module.exports = app;
