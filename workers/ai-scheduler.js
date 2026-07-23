/**
 * AI 分析定时调度器
 * 开盘时段每 30 分钟生成一次 AI 市场分析，写入缓存供前端读取
 */

const { getCache, setCache } = require('../services/cache');
const { generateMarketAnalysis } = require('../services/openai');
const { makeKey, getAiCache, setAiCache } = require('../services/ai-cache');

let isGenerating = false;

/**
 * 执行 AI 市场分析生成
 */
async function generateAiAnalysis() {
  if (isGenerating) {
    console.log('[AI Scheduler] Previous generation still running, skipping');
    return;
  }

  isGenerating = true;
  console.log('[AI Scheduler] Generating AI market analysis...');

  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const overview = getCache(`overview:${today}`);

    if (!overview) {
      console.log('[AI Scheduler] No market data available yet, skipping');
      isGenerating = false;
      return;
    }

    const marketData = {
      temperature: overview.market?.temperature,
      up: overview.market?.up,
      down: overview.market?.down,
      turnover: overview.market?.turnover,
      limitUp: overview.market?.limitUp,
      limitDown: overview.market?.limitDown,
      sectors: overview.sectors?.slice(0, 4)
    };

    const cacheKey = makeKey('market-analysis', { today, temp: marketData.temperature, sectors: marketData.sectors?.length });
    const cached = getAiCache(cacheKey);
    if (cached) {
      console.log('[AI Scheduler] Recent analysis exists, skipping');
      isGenerating = false;
      return;
    }

    const result = await generateMarketAnalysis(marketData);

    if (result.success) {
      // 缓存 AI 分析结果
      setAiCache(cacheKey, result, 30 * 60 * 1000);

      // 同时写入 overview 的 catalystFeed
      if (result.catalysts) {
        const catalysts = result.catalysts.map(c => ({
          time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
          type: c.type || '综合',
          title: c.catalyst || '',
          sector: c.sector || '',
          impact: c.impact || '中',
          source: 'AI 分析'
        }));

        // 更新 overview 缓存
        const updatedOverview = {
          ...overview,
          catalystFeed: catalysts,
          aiSummary: result.summary || '',
          aiRiskNote: result.riskNote || ''
        };
        setCache(`overview:${today}`, updatedOverview, 24 * 60 * 60);
      }

      console.log('[AI Scheduler] AI analysis generated and cached');
    }
  } catch (err) {
    console.error('[AI Scheduler] Generation failed:', err.message);
  } finally {
    isGenerating = false;
  }
}

/**
 * 启动 AI 调度器
 */
function startAiScheduler() {
  console.log('[AI Scheduler] Starting AI analysis scheduler...');

  // 服务启动后延迟 60 秒执行一次（等数据先拉取）
  setTimeout(generateAiAnalysis, 60000);

  // 之后在开盘时段每 30 分钟执行
  setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();

    // 开盘时段 (9:30-15:00)
    const isMarketHours = (hour >= 9 && hour <= 15) && !(hour === 9 && minute < 30);

    if (isMarketHours) {
      generateAiAnalysis();
    }
  }, 30 * 60 * 1000);

  console.log('[AI Scheduler] AI scheduler started (30min interval during market hours)');
}

module.exports = { startAiScheduler, generateAiAnalysis };
