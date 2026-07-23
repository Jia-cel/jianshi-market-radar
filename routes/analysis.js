/**
 * AI 分析 API
 * - POST /api/analysis/market    市场分析生成
 * - POST /api/analysis/financial 财报 AI 解读
 */

const express = require('express');
const { authRequired } = require('../middleware/auth');
const { generateMarketAnalysis, analyzeFinancials, getUsageStats } = require('../services/openai');
const { makeKey, getAiCache, setAiCache } = require('../services/ai-cache');
const { getCache } = require('../services/cache');

const router = express.Router();

/**
 * POST /api/analysis/market
 * 生成 AI 市场分析
 */
router.post('/market', authRequired, async (req, res) => {
  // 从缓存获取当前市场数据
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let marketData = req.body;

  if (!marketData || !marketData.temperature) {
    // 尝试从缓存获取
    const overview = getCache(`overview:${today}`);
    if (overview) {
      marketData = {
        temperature: overview.market?.temperature,
        up: overview.market?.up,
        down: overview.market?.down,
        turnover: overview.market?.turnover,
        limitUp: overview.market?.limitUp,
        limitDown: overview.market?.limitDown,
        sectors: overview.sectors?.slice(0, 4)
      };
    }
  }

  if (!marketData || !marketData.temperature) {
    return res.status(400).json({ error: '市场数据未就绪，请等待数据刷新' });
  }

  const cacheKey = makeKey('market-analysis', { today, temp: marketData.temperature, sectors: marketData.sectors?.length });
  const cached = getAiCache(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const result = await generateMarketAnalysis(marketData);
    setAiCache(cacheKey, result, 30 * 60 * 1000); // 缓存 30 分钟
    res.json(result);
  } catch (err) {
    console.error('[analysis] Market analysis error:', err.message);
    res.status(500).json({ error: 'AI 分析失败: ' + err.message });
  }
});

/**
 * POST /api/analysis/financial
 * 财报 AI 解读
 */
router.post('/financial', authRequired, async (req, res) => {
  const { stockName, stockCode, profitTrend, revenueTrend } = req.body;

  if (!stockName || !stockCode || !profitTrend) {
    return res.status(400).json({ error: '请提供完整的财务数据' });
  }

  const cacheKey = makeKey('financial', { stockCode, profitTrend, revenueTrend });
  const cached = getAiCache(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const result = await analyzeFinancials(stockName, stockCode, {
      profitTrend,
      revenueTrend
    });
    setAiCache(cacheKey, result, 60 * 60 * 1000); // 缓存 1 小时
    res.json(result);
  } catch (err) {
    console.error('[analysis] Financial analysis error:', err.message);
    res.status(500).json({ error: 'AI 财报解读失败: ' + err.message });
  }
});

/**
 * GET /api/analysis/usage
 * AI 使用统计（调试用）
 */
router.get('/usage', (req, res) => {
  res.json(getUsageStats());
});

module.exports = router;
