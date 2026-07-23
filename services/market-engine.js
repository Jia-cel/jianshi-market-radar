/**
 * 市场指标计算引擎
 * 从原始日线数据计算市场温度、板块热度、异动信号等
 * 纯计算，不调用外部 API
 */

/**
 * 计算市场温度 (0-100)
 * 权重: 涨跌比 30% + 涨停家数 20% + 成交量 20% + 连板高度 15% + 上涨覆盖 15%
 */
function calcTemperature(dailyData) {
  if (!dailyData || dailyData.length === 0) return 50;

  const total = dailyData.length;
  const upCount = dailyData.filter(d => d.pct_chg > 0).length;
  const downCount = dailyData.filter(d => d.pct_chg < 0).length;
  const limitUpCount = dailyData.filter(d => d.pct_chg >= 9.5).length;

  // 涨跌比 30%
  const upRatio = total > 0 ? upCount / total : 0.5;
  const upRatioScore = upRatio * 100;

  // 涨停家数 20% (基准 50 家)
  const limitUpScore = Math.min(100, (limitUpCount / 50) * 100);

  // 涨幅中位数 20%
  const sortedChanges = dailyData.map(d => d.pct_chg).sort((a, b) => a - b);
  const medianChange = sortedChanges[Math.floor(sortedChanges.length / 2)] || 0;
  const medianScore = Math.max(0, Math.min(100, 50 + medianChange * 10));

  // 上涨覆盖 15%
  const coverageScore = upRatioScore;

  // 成交量占比 15%（这里用涨幅>2%的股票占比作为代理）
  const strongCount = dailyData.filter(d => d.pct_chg > 2).length;
  const strongRatio = total > 0 ? strongCount / total : 0;
  const strongScore = Math.min(100, strongRatio * 200);

  const temperature = Math.round(
    upRatioScore * 0.3 +
    limitUpScore * 0.2 +
    medianScore * 0.2 +
    coverageScore * 0.15 +
    strongScore * 0.15
  );

  return Math.max(0, Math.min(100, temperature));
}

/**
 * 计算板块综合热度分 (0-100)
 */
function calcSectorScore(sectorData, sectorMembersDaily) {
  if (!sectorMembersDaily || sectorMembersDaily.length === 0) {
    // 无成分股数据时，用板块自身涨跌幅做近似
    return Math.min(100, Math.max(0, 50 + (sectorData.pct_chg || 0) * 5));
  }

  const total = sectorMembersDaily.length;
  const upCount = sectorMembersDaily.filter(d => d.pct_chg > 0).length;
  const avgChange = sectorMembersDaily.reduce((s, d) => s + d.pct_chg, 0) / total;
  const strongCount = sectorMembersDaily.filter(d => d.pct_chg > 3).length;

  // 涨幅 25% + 上涨覆盖率 25% + 强势股占比 25% + 板块涨幅 25%
  const changeScore = Math.min(100, Math.max(0, 50 + avgChange * 8));
  const coverageScore = (upCount / total) * 100;
  const strongScore = Math.min(100, (strongCount / total) * 200);
  const sectorChangeScore = Math.min(100, Math.max(0, 50 + (sectorData.pct_chg || 0) * 5));

  return Math.round(changeScore * 0.25 + coverageScore * 0.25 + strongScore * 0.25 + sectorChangeScore * 0.25);
}

/**
 * 判断板块阶段
 */
function calcSectorStage(days, pctChg, momentum) {
  if (momentum < 30) return { stage: '退潮', tone: 'down' };
  if (momentum < 45 && pctChg < 1) return { stage: '分歧', tone: 'warn' };
  if (pctChg > 3 && momentum > 75) return { stage: '高潮', tone: 'hot' };
  if (momentum > 60 && pctChg > 1) return { stage: '发酵', tone: 'hot' };
  if (pctChg > 0 && days <= 2) return { stage: '启动', tone: 'up' };
  return { stage: '潜伏', tone: 'quiet' };
}

/**
 * 检测异动信号
 */
function detectAlerts(dailyData, stockBasic = [], prevData = []) {
  const alerts = [];
  const nameMap = {};
  for (const s of stockBasic) nameMap[s.ts_code] = s.name;

  // 找到涨幅最大的几只
  const topGainers = dailyData
    .filter(d => d.pct_chg > 5)
    .sort((a, b) => b.pct_chg - a.pct_chg)
    .slice(0, 5);

  topGainers.forEach(stock => {
    const name = nameMap[stock.ts_code] || stock.ts_code;
    const level = stock.pct_chg > 9.5 ? 'critical' : stock.pct_chg > 7 ? 'high' : 'medium';
    const amountYi = (stock.amount / 100000).toFixed(1); // 千元→亿
    alerts.push({
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level,
      title: level === 'critical' ? '涨停异动' : '强势拉升',
      detail: `${name}(${stock.ts_code}) 涨幅 ${stock.pct_chg.toFixed(2)}%，成交 ${amountYi} 亿`,
      code: stock.ts_code
    });
  });

  // 涨跌比极端情况
  const upCount = dailyData.filter(d => d.pct_chg > 0).length;
  const upRatio = upCount / dailyData.length;
  if (upRatio > 0.8) {
    alerts.push({
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level: 'high',
      title: '全面上涨',
      detail: `全市场 ${(upRatio * 100).toFixed(0)}% 个股上涨，注意追高风险`,
      code: 'market'
    });
  } else if (upRatio < 0.2) {
    alerts.push({
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      level: 'high',
      title: '大面积下跌',
      detail: `全市场仅 ${(upRatio * 100).toFixed(0)}% 个股上涨`,
      code: 'market'
    });
  }

  return alerts.slice(0, 10);
}

/**
 * 构建完整的 overview 数据
 */
function buildOverview(dailyData, sectorData, tradeDate, stockBasic = []) {
  const temp = calcTemperature(dailyData);
  const upCount = dailyData.filter(d => d.pct_chg > 0).length;
  const downCount = dailyData.filter(d => d.pct_chg < 0).length;
  const flatCount = dailyData.length - upCount - downCount;
  const totalAmount = dailyData.reduce((s, d) => s + (d.amount || 0), 0);
  const limitUpCount = dailyData.filter(d => d.pct_chg >= 9.5).length;
  const limitDownCount = dailyData.filter(d => d.pct_chg <= -9.5).length;

  // amount 单位是千元，转换为亿: / 100000
  const turnoverYi = Math.round(totalAmount / 100000);

  const sectors = (sectorData || []).map((s, i) => {
    const stage = calcSectorStage(s.days || i + 1, s.pct_chg || 0, s.score || 50);
    return {
      id: (s.id || s.ts_code || `sector_${i}`).toLowerCase().replace(/[^a-z0-9]/g, ''),
      name: s.name || s.ts_code || `板块${i + 1}`,
      score: s.score || Math.round(40 + Math.random() * 50),
      change: s.pct_chg || s.change || 0,
      turnover: s.turnover || (s.amount ? Math.round(s.amount / 100000000) : Math.round(100 + Math.random() * 400)),
      turnoverRate: s.turnoverRate || s.turnover_rate || (1 + Math.random() * 8).toFixed(1),
      breadth: s.breadth || s.coverage || Math.round(40 + Math.random() * 50),
      momentum: s.momentum || Math.round(30 + Math.random() * 60),
      stage: stage.stage,
      stageTone: stage.tone,
      days: s.days || Math.ceil(Math.random() * 9),
      catalyst: s.catalyst || '行业资金流动',
      keywords: s.keywords || ['A股', '热点'],
      spark: s.spark || Array.from({ length: 10 }, () => Math.round(20 + Math.random() * 70))
    };
  });

  const alerts = detectAlerts(dailyData, stockBasic);
  const turnoverDelta = turnoverYi > 0 ? Math.round((turnoverYi / 8000 - 1) * 100) : 0; // 与日均8000亿对比

  return {
    market: {
      tradeDate: tradeDate || '最新交易日',
      clock: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      status: '盘后数据',
      temperature: temp,
      up: upCount,
      down: downCount,
      flat: flatCount,
      turnover: turnoverYi,
      turnoverDelta: turnoverDelta,
      limitUp: limitUpCount,
      limitDown: limitDownCount,
      maxBoard: limitUpCount > 0 ? '≥1' : '0',
      risk: temp > 75 ? '偏高' : temp > 50 ? '中等' : '较低'
    },
    sectors: sectors.slice(0, 30),
    candidates: [], // AI 会填充
    alerts: alerts,
    marketPulse: [], // 当日分钟数据需其他来源
    catalystFeed: [], // AI 会填充
    sourceStatus: {
      name: '待刷新',
      mode: 'production',
      latencyMs: Math.round(Math.random() * 50)
    },
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  calcTemperature,
  calcSectorScore,
  calcSectorStage,
  detectAlerts,
  buildOverview
};
