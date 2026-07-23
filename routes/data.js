const express = require('express');
const { getCache, setCache, getCacheStats } = require('../services/cache');
const { getDailyData } = require('../services/tushare');
const router = express.Router();

/**
 * GET /api/data/quote/:code
 * 单票实时行情（目前用日线数据）
 */
router.get('/quote/:code', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheKey = `quote:${req.params.code}:${today}`;

    let data = getCache(cacheKey);
    if (!data) {
      const dailyData = await getDailyData(today);
      data = dailyData.find(d => d.ts_code === req.params.code) || null;
      if (data) setCache(cacheKey, data, 300);
    }

    if (!data) {
      return res.status(404).json({ error: '未找到行情数据' });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/data/sectors
 * 板块排行数据（东方财富概念+行业板块）
 */
router.get('/sectors', async (req, res) => {
  try {
    const { getSectors, getConcepts } = require('../services/eastmoney');
    const cacheKey = 'sectors:current';
    let data = getCache(cacheKey);
    if (!data) {
      const [industries, concepts] = await Promise.all([getSectors(), getConcepts()]);
      // 合并并排序：概念板块优先，按涨跌幅降序
      data = [...(concepts || []), ...(industries || [])]
        .sort((a, b) => Math.abs(b.pctChg || 0) - Math.abs(a.pctChg || 0));
      if (data.length > 0) setCache(cacheKey, data, 300);
    }
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/data/market-status
 * 市场整体状态
 */
router.get('/market-status', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const cacheKey = `market-status:${today}`;

    let overview = getCache(cacheKey);
    if (!overview) {
      overview = getCache(`overview:${today}`);
    }

    if (!overview) {
      return res.json({
        status: '等待数据刷新',
        temperature: 0,
        up: 0,
        down: 0,
        sourceStatus: { name: '数据加载中', mode: 'loading' }
      });
    }

    res.json(overview.market || overview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/data/cache-stats
 * 缓存统计（调试用）
 */
router.get('/cache-stats', (req, res) => {
  res.json(getCacheStats());
});

/**
 * GET /api/data/snapshot-status
 * 快照引擎状态（3 秒高频监控运行信息）
 */
router.get('/snapshot-status', (req, res) => {
  try {
    const worker = require('../services/snapshot-worker');
    res.json(worker.getStatus());
  } catch {
    res.json({ isRunning: false, error: 'snapshot worker not loaded' });
  }
});

/**
 * GET /api/data/refresh
 * 手动触发数据刷新（调试用，浏览器可直接访问）
 */
router.get('/refresh', async (req, res) => {
  const { refreshData, getStatus } = require('../workers/scheduler');
  const status = getStatus();
  // 同步执行，返回日志给浏览器
  const result = await refreshData();
  res.json({ status, result });
});

module.exports = router;
