require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const { initSchema } = require('./db/schema');
const { closeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 初始化数据库
initSchema();

// API 路由
app.use('/api/auth', require('./routes/auth'));
app.use('/api/overview', require('./routes/overview'));
app.use('/api/data', require('./routes/data'));
app.use('/api/pattern', require('./routes/pattern'));     // AI 形态识别
app.use('/api/analysis', require('./routes/analysis'));   // AI 分析

// 启动数据调度器
const { startScheduler } = require('./workers/scheduler');
startScheduler();

// 启动 AI 分析调度器
const { startAiScheduler } = require('./workers/ai-scheduler');
startAiScheduler();

// 启动 3 秒高频快照引擎（候选池实时监控）
const snapshotWorker = require('./services/snapshot-worker');
snapshotWorker.start();

// SSE 实时推送（整合快照引擎告警 + 市场温度）
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  res.write('event: ready\ndata: {"at":"' + new Date().toISOString() + '"}\n\n');

  let lastAlertIds = new Set(); // 去重用

  const interval = setInterval(() => {
    try {
      // 从缓存读市场温度
      const { getDb } = require('./db');
      const db = getDb();
      const row = db.prepare(
        `SELECT cache_value FROM market_cache WHERE cache_key = 'overview:current' AND expires_at > datetime('now')`
      ).get();

      let temperature = 50;
      if (row) {
        const data = JSON.parse(row.cache_value);
        temperature = data.market?.temperature || 50;
      }

      // 从快照引擎取全部告警
      const liveAlerts = snapshotWorker.getAlerts();
      const newAlerts = liveAlerts.filter(a => {
        const id = a.code + '|' + a.title + '|' + a.time;
        if (lastAlertIds.has(id)) return false;
        lastAlertIds.add(id);
        return true;
      });

      // 保持 Set 不会无限增长
      if (lastAlertIds.size > 200) {
        const arr = [...lastAlertIds];
        lastAlertIds = new Set(arr.slice(-100));
      }

      const latestAlert = liveAlerts.length > 0 ? liveAlerts[0] : null;

      res.write(`event: market-update\ndata: ${JSON.stringify({
        temperature,
        alert: latestAlert,
        newAlerts: newAlerts.slice(0, 10)
      })}\n\n`);
    } catch { /* skip */ }
  }, 3000); // 3 秒推送，配合快照引擎

  req.on('close', () => clearInterval(interval));
});

// SPA 回退路由
// SPA 回退路由（Express 5 用 app.use 处理通配）
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 启动服务
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`\n🚀 见势 · A股热点雷达 已启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`   登录: http://localhost:${PORT}/login`);
  console.log(`   SMS 开发模式: ${process.env.SMS_DEV_MODE === 'true' ? '✅ 开启（验证码打印到控制台）' : '❌ 关闭'}\n`);
});

// Render 防休眠：每 10 分钟自 ping 一次，防止免费版 15 分钟无流量自动休眠
const RENDER_URL = process.env.RENDER_URL || `http://localhost:${PORT}`;
setInterval(() => {
  const http = require('http');
  http.get(RENDER_URL + '/api/data/cache-stats', res => {
    // 静默，仅保持连接活跃
  }).on('error', () => {});
}, 10 * 60 * 1000);
console.log('  [Heartbeat] 防休眠已启用 (每10分钟)');

// 优雅退出
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  closeDb();
  process.exit(0);
});
