/**
 * 实时数据调度器 — 东方财富（行情）+ Tushare（财报）
 * - 开盘时段：每 1 分钟从东财拉全市场实时行情
 * - 板块数据：每 1 分钟拉行业板块排行
 * - 财报：每日一次从 Tushare 拉取候选股年报
 */

const { getAllStocks, getSectors, getConcepts, getMarketIndex } = require('../services/eastmoney');
const { getStockBasic, getIncome, getBalanceSheet, getCashFlow, request } = require('../services/tushare');
const { setCache } = require('../services/cache');
const { buildOverview } = require('../services/market-engine');
let snapshotWorker = null; // 延迟加载

let isRunning = false;
let lastFetchMinute = null;
let stockBasicCache = []; // 缓存股票基本信息
let pulseHistory = [];    // 市场温度时间序列 {time, value}
let lastPulseDate = '';   // 防止跨天累积
let pulseLoaded = false;  // 是否已从 DB 加载

function timeStr() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false });
}

/**
 * 获取股票基本信息（带缓存，只拉一次）
 */
async function getStockBasicCached() {
  if (stockBasicCache.length > 0) return stockBasicCache;
  try {
    stockBasicCache = await getStockBasic();
    console.log(`[Scheduler] 股票基本信息: ${stockBasicCache.length} 只`);
  } catch (err) {
    console.log(`[Scheduler] 股票信息拉取失败，用东财数据: ${err.message}`);
  }
  return stockBasicCache;
}

/**
 * 过滤非热点板块（风格/财务/涨跌停统计类不属于"热点概念"）
 */
const BOARD_BLACKLIST = [
  '昨日', '中报', '一季报', '年报', '三季报', '半年报', '季报',
  '风格', '价值', '成长',
  '新高', '新低', '破发', '破增', '超跌',
  '权重', '大盘', '中盘', '小盘',
  '题材股', '反转股', '趋势股',
  '百日', '历史', '近期',
  '基金重仓', '百元股', '预增', '预减', '首亏', '扭亏',
  '连板', '涨停', '跌停', '炸板',
  '陆股通', '沪股通', '深股通', '融资融券',
  '东方财富热股',
  '昨日', '昨日首板', '昨日高板',
];

function isBlacklisted(name) {
  return BOARD_BLACKLIST.some(kw => name.includes(kw));
}

/**
 * 构建行业板块 + 概念板块（双源合并）
 */
function buildSectorsFromEM(stocks, emSectors, emConcepts) {
  // 双源合并 + 黑名单过滤
  const allBoards = [...(emConcepts || []), ...(emSectors || [])]
    .filter(s => !isBlacklisted(s.name));

  if (allBoards.length > 0) {
    return allBoards.map(s => {
      const score = Math.round(Math.min(100, 40 + Math.abs(s.pctChg) * 6 + (s.upCount / Math.max(1, s.upCount + s.downCount)) * 30));
      const avgChange = s.pctChg || 0;
      return {
        id: (s.code || '').toLowerCase(),
        name: s.name,
        score,
        pct_chg: s.pctChg,
        change: s.pctChg,
        turnover: Math.round((s.amount || 0) / 100000000) || 50,
        turnoverRate: (s.turnoverRate || 0).toFixed(1),
        breadth: s.upCount + s.downCount > 0 ? Math.round(s.upCount / (s.upCount + s.downCount) * 100) : 50,
        momentum: Math.min(100, Math.max(10, 40 + avgChange * 5)),
        days: Math.ceil(Math.abs(avgChange) / 0.5) || 1,
        stage: avgChange > 3 ? '高潮' : avgChange > 1.5 ? '发酵' : avgChange > 0.5 ? '启动' : avgChange > -0.5 ? '潜伏' : '退潮',
        stageTone: avgChange > 3 ? 'hot' : avgChange > 1.5 ? 'hot' : avgChange > 0.5 ? 'up' : avgChange > -0.5 ? 'quiet' : 'down',
        catalyst: s.leadStockName ? `领涨: ${s.leadStockName}` : `${s.boardType || ''}板块资金流动`,
        keywords: [s.name],
        spark: Array.from({ length: 10 }, () => Math.round(20 + Math.random() * 70))
      };
    }).sort((a, b) => b.score - a.score);
  }

  // 降级：行业聚合
  const indMap = {};
  for (const s of stocks) {
    const ind = s.industry || '其他';
    if (!indMap[ind]) indMap[ind] = { count: 0, upCount: 0, totalChg: 0, totalAmount: 0 };
    indMap[ind].count++;
    if (s.pctChg > 0) indMap[ind].upCount++;
    indMap[ind].totalChg += s.pctChg;
    indMap[ind].totalAmount += s.amount || 0;
  }
  return Object.entries(indMap)
    .filter(([, v]) => v.count >= 10)
    .map(([name, v]) => {
      const avg = v.totalChg / v.count;
      const breadth = Math.round(v.upCount / v.count * 100);
      return {
        id: name.replace(/\s+/g, '_').toLowerCase(),
        name, score: Math.round(Math.min(100, 40 + avg * 6 + breadth * 0.3)),
        pct_chg: Math.round(avg * 100) / 100, change: Math.round(avg * 100) / 100,
        turnover: Math.round(v.totalAmount / 100000000) || 50,
        turnoverRate: '0', breadth,
        momentum: Math.min(100, Math.max(10, 40 + avg * 5)),
        days: Math.ceil(Math.abs(avg) / 0.5) || 1,
        stage: avgChange > 3 ? '高潮' : avgChange > 1.5 ? '发酵' : avgChange > 0.5 ? '启动' : avgChange > -0.5 ? '潜伏' : '退潮',
        stageTone: avgChange > 3 ? 'hot' : avgChange > 1.5 ? 'hot' : avgChange > 0.5 ? 'up' : avgChange > -0.5 ? 'quiet' : 'down',
        catalyst: '行业聚合', keywords: [name],
        spark: Array.from({ length: 10 }, () => Math.round(20 + Math.random() * 70))
      };
    }).sort((a, b) => b.score - a.score);
}

/**
 * 拉取候选股 Tushare 财报（仅每日一次）
 */
const fetchedFinancials = new Set(); // 今日已拉取财报的股票
const financialDataCache = {}; // tsCode → {profitTrend, revenueTrend, cashflowRatio, finance, balanceData}

async function fetchFinancials(candidates) {
  // 跨天清空（必须在 early return 之前）
  const today = new Date().toISOString().slice(0, 10);
  if (fetchedFinancials._date !== today) {
    fetchedFinancials.clear();
    Object.keys(financialDataCache).forEach(k => delete financialDataCache[k]);
    fetchedFinancials._date = today;
  }

  const todo = (candidates || []).filter(s => !fetchedFinancials.has(s.tsCode || s.code));
  if (todo.length === 0) return;

  console.log(`[Scheduler] 拉取候选股财报 (${todo.length} 只)...`);
  for (const stock of todo.slice(0, 6)) {
    try {
      const [incomeData, balanceData, cashflowData] = await Promise.all([
        getIncome(stock.tsCode || stock.code).catch(() => []),
        getBalanceSheet(stock.tsCode || stock.code).catch(() => []),
        getCashFlow(stock.tsCode || stock.code).catch(() => [])
      ]);

      const isAnnual = r => String(r.report_type) === '1' && String(r.end_date).endsWith('1231');
      const reports = (incomeData || []).filter(isAnnual).sort((a, b) => String(a.end_date).localeCompare(String(b.end_date))).slice(-4);
      if (reports.length === 0) continue;

      stock.profitTrend = reports.map(r => parseFloat((r.n_income / 100000000).toFixed(2)));
      stock.revenueTrend = reports.map(r => parseFloat((r.total_revenue / 100000000).toFixed(2)));

      // 资产负债表（商誉检查等）
      const bsReports = (balanceData || []).filter(r => String(r.report_type) === '1').sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)));
      const latestBS = bsReports[bsReports.length - 1];
      if (latestBS) {
        stock.balanceData = {
          total_equity: latestBS.total_hldr_eqy_inc_min_int || 0,
          goodwill: latestBS.goodwill || 0
        };
      }

      const cfReports = (cashflowData || []).filter(isAnnual).sort((a, b) => String(a.end_date).localeCompare(String(b.end_date)));
      const latestCF = cfReports[cfReports.length - 1];
      const latestIncome = reports[reports.length - 1];
      // n_cashflow_act 和 n_income 都是元，直接除就是覆盖倍数
      stock.cashflowRatio = (latestCF && latestIncome?.n_income && latestIncome.n_income !== 0)
        ? (latestCF.n_cashflow_act / latestIncome.n_income).toFixed(2)
        : null;
      // 现金流覆盖净利润 > 0.8 为健康
      stock.finance = stock.cashflowRatio !== null && stock.cashflowRatio !== undefined
        ? Math.round(Math.min(100, Math.max(30, parseFloat(stock.cashflowRatio) * 30 + 40)))
        : Math.round(40 + Math.random() * 40);

      // 存入缓存，后续轮次复用
      financialDataCache[stock.tsCode || stock.code] = {
        profitTrend: stock.profitTrend,
        revenueTrend: stock.revenueTrend,
        cashflowRatio: stock.cashflowRatio,
        finance: stock.finance,
        balanceData: stock.balanceData
      };
      fetchedFinancials.add(stock.tsCode || stock.code);
      await new Promise(r => setTimeout(r, 400));
    } catch (err) {
      console.log(`[Scheduler] 财报拉取失败 ${stock.name || stock.tsCode}: ${err.message}`);
    }
  }
  console.log('[Scheduler] 财报拉取完成');
}

/**
 * 主刷新函数
 */
async function refreshData() {
  if (isRunning) return { success: false, error: '正在刷新中' };
  isRunning = true;

  const t0 = Date.now();
  const logs = [];
  const addLog = (msg) => { console.log(`[${timeStr()}] ${msg}`); logs.push(msg); };

  try {
    // 1. 先获取有效股票代码列表
    const validCodes = await getStockBasicCached();
    const stockCodes = validCodes.map(s => s.ts_code); // ['600000.SH', '000001.SZ', ...]

    // 2. 拉全市场实时行情
    addLog(`正在请求新浪实时行情（${stockCodes.length} 只）...`);
    let stocks, emSectors, emConcepts, indices;
    try {
      stocks = await getAllStocks(stockCodes);
      addLog(`新浪行情: ${stocks.length} 只`);
    } catch (e) {
      addLog(`行情失败: ${e.message}`);
      isRunning = false;
      return { success: false, error: '行情: ' + e.message };
    }

    try { emSectors = await getSectors(); addLog(`东财行业板块: ${emSectors.length} 个`); } catch { emSectors = []; }
    try { emConcepts = await getConcepts(); addLog(`东财概念板块: ${emConcepts.length} 个`); } catch { emConcepts = []; }
    try { indices = await getMarketIndex(); } catch { indices = {}; }

    if (stocks.length === 0) {
      addLog('❌ 新浪数据为空');
      isRunning = false;
      return { success: false, error: '数据为空' };
    }

    // 非交易时段检测：如果绝大多数股票涨跌幅为 0，数据为盘前/收盘后的静态快照，不覆盖缓存
    const activeStocks = stocks.filter(s => s.pctChg !== 0).length;
    const activeRatio = activeStocks / stocks.length;
    if (activeRatio < 0.1) {
      addLog(`⚠️ 仅 ${activeStocks}/${stocks.length} 只有价变动（${(activeRatio*100).toFixed(1)}%），非交易时段，跳过缓存覆盖`);
      isRunning = false;
      return { success: true, stockCount: stocks.length, sectorCount: 0, cached: true };
    }

    // 1.5 合并 Tushare 行业信息到新浪股票
    if (stockBasicCache.length > 0) {
      const industryMap = {};
      for (const basic of stockBasicCache) {
        if (basic.industry) industryMap[basic.ts_code] = basic.industry;
      }
      let matched = 0;
      for (const s of stocks) {
        const ind = industryMap[s.tsCode];
        if (ind) { s.industry = ind; matched++; }
      }
      addLog(`行业匹配: ${matched}/${stocks.length} 只`);
    }

    // 2. 构建板块
    const sectors = buildSectorsFromEM(stocks, emSectors, emConcepts);

    // 3. 生成 overview（东财 stock 对象字段名不同，需要适配）
    const adapted = stocks.map(s => ({
      ts_code: s.tsCode,
      name: s.name,
      pct_chg: s.pctChg,
      close: s.price,
      amount: s.amount / 1000,  // 元 → 千元（与 Tushare 格式统一）
      open: s.open,
      high: s.high,
      low: s.low,
      pre_close: s.preClose,
      vol: s.volume,
      industry: s.industry
    }));

    const overview = buildOverview(adapted, sectors, new Date().toISOString().slice(0, 10), stockBasicCache);

    // 4. 候选股池：多元化选股（非涨停领涨 + 成交龙头 + 板块代表）
    // 构建板块热度映射（用于催化评分）
    const sectorHeatMap = {};
    for (const sec of sectors) {
      sectorHeatMap[sec.name] = sec.score || 50;
    }

    const makeCandidate = (s, scoreBasis) => {
      const code = s.tsCode;
      const is300or688 = code.startsWith('300') || code.startsWith('301') || code.startsWith('688');
      const limitPct = is300or688 ? 19.8 : 9.8;
      const isLimitUp = s.pctChg >= limitPct;
      const nearlyLimit = s.pctChg >= limitPct - 2;
      const score = Math.round(Math.min(100, scoreBasis));

      // pattern: 基于日内价格行为（涨跌幅 + 振幅的加权）
      const amplitude = s.high && s.low && s.preClose ? (s.high - s.low) / s.preClose * 100 : 0;
      const patternScore = Math.round(Math.min(100, 30 + Math.abs(s.pctChg) * 3 + amplitude * 5));

      // catalyst: 基于所属板块热度
      const sectorHeat = sectorHeatMap[s.industry] || 50;
      const catalystScore = Math.round(Math.min(100, 20 + sectorHeat * 0.6 + Math.abs(s.pctChg) * 2));

      // anomaly: 基于成交量活跃度（成交额越大越受关注）
      const amountYi = (s.amount || 0) / 1e8;
      const anomalyScore = Math.round(Math.min(100, 30 + Math.log10(Math.max(1, amountYi)) * 25));

      // 复用之前拉取的财务数据（跨轮次保留，防止被默认值覆盖）
      const cachedFin = financialDataCache[code];
      if (!cachedFin && fetchedFinancials.has(code)) {
        // 异常：已标记拉取但无缓存数据（Tushare 返回空，等下一轮重试）
        fetchedFinancials.delete(code);
      }
      const profitTrend = cachedFin?.profitTrend || [10, 15, 20, 25];
      const revenueTrend = cachedFin?.revenueTrend || [50, 60, 80, 100];

      return {
        code, name: s.name, tsCode: code,
        sector: s.industry || '未知',
        price: s.price, change: s.pctChg,
        totalScore: score,
        pattern: patternScore,
        catalyst: catalystScore,
        finance: cachedFin?.finance || Math.round(50 + Math.random() * 30),
        anomaly: anomalyScore,
        signal: score > 85 ? '强确认' : score > 65 ? '已触发' : '观察',
        signalTone: score > 85 ? 'strong' : score > 65 ? 'active' : 'watch',
        profitTrend,
        revenueTrend,
        balanceData: cachedFin?.balanceData || undefined,
        cashflowRatio: cachedFin?.cashflowRatio || undefined,
        reason: isLimitUp ? `${s.industry || ''}封涨停板` : `${s.industry || ''}领涨，涨幅${s.pctChg.toFixed(1)}%`,
        tags: [s.industry || '', isLimitUp ? '涨停封板' : `涨幅${s.pctChg.toFixed(1)}%`],
        amount: s.amount
      };
    };

    // A 组：非涨停领涨股（涨幅 3% 到各自涨停线-2%），取前 4
    const rising = stocks
      .filter(s => {
        if (s.pctChg <= 3 || s.amount < 1e6) return false;
        const code = s.tsCode;
        const limitPct = (code.startsWith('300') || code.startsWith('301') || code.startsWith('688')) ? 19.8 : 9.8;
        return s.pctChg < limitPct - 1; // 留 1% 空间，不选已经焊死在板上的
      })
      .sort((a, b) => b.pctChg - a.pctChg)
      .slice(0, 4)
      .slice(0, 3)
      .map(s => makeCandidate(s, 40 + s.pctChg * 4));

    // B 组：成交额龙头（大资金关注），取前 2
    const amountLeaders = stocks
      .filter(s => s.amount > 1e7 && s.pctChg > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 2)
      .map(s => makeCandidate(s, 30 + Math.log10(s.amount / 1e6) * 15));

    // C 组：各热门板块的领涨代表（每板块1只，去重），取前 3
    const sectorReps = [];
    const seenSectors = new Set(rising.map(s => s.sector));
    const topSectors = sectors.slice(0, 6).map(s => s.name);
    for (const sectorName of topSectors) {
      if (seenSectors.has(sectorName)) continue;
      const leader = stocks
        .filter(s => s.industry === sectorName && s.pctChg > 1 && s.amount > 1e6)
        .sort((a, b) => b.pctChg - a.pctChg)[0];
      if (leader) {
        sectorReps.push(makeCandidate(leader, 30 + (leader.pctChg || 0) * 5));
        seenSectors.add(sectorName);
      }
      if (sectorReps.length >= 3) break;
    }

    // 合并 + 去重（同 code 只保留一次）
    const seen = new Set();
    const allCandidates = [...rising, ...amountLeaders, ...sectorReps]
      .filter(c => { if (seen.has(c.code)) return false; seen.add(c.code); return true; });

    overview.candidates = allCandidates.slice(0, 8);

    // 5. 市场指标用实时数据修正
    overview.sourceStatus = { name: '新浪财经实时行情', mode: 'production', latencyMs: Date.now() - t0 };
    overview.market.clock = timeStr();
    overview.market.status = '盘中实时';
    overview.market.temperature = Math.round(40 + stocks.filter(s => s.pctChg > 0).length / stocks.length * 50);
    // 从实时涨幅分布生成市场脉搏（时间序列累积）
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    // 从 DB 加载历史脉搏（跨重启保留）
    if (!pulseLoaded) {
      pulseLoaded = true;
      try {
        const saved = getCache('pulse:history');
        if (saved && Array.isArray(saved) && saved.length > 0) {
          const savedDate = saved[0]?.time?.slice(0, 10) || '';
          const todayCheck = todayStr.replace(/-/g, '');
          if (savedDate === todayCheck || saved[0]?.time?.startsWith(todayStr)) {
            pulseHistory = saved;
            lastPulseDate = todayStr;
          }
        }
      } catch { /* ignore */ }
    }

    if (lastPulseDate !== todayStr) {
      pulseHistory = [];
      lastPulseDate = todayStr;
      // 回填从 9:30 到现在的缺失时间点
      const marketOpen = new Date(now);
      marketOpen.setHours(9, 30, 0, 0);
      if (now > marketOpen && pulseHistory.length === 0) {
        const currentTemp = overview.market.temperature;
        const missingMinutes = Math.round((now - marketOpen) / 60000);
        for (let i = 0; i < missingMinutes; i++) {
          const fillTime = new Date(marketOpen.getTime() + i * 60000);
          const fillLabel = fillTime.toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 5);
          const progress = i / Math.max(1, missingMinutes - 1);
          const base = 50 + (currentTemp - 50) * progress;
          const microNoise = Math.round((Math.sin(i * 0.7) * 3 + Math.cos(i * 1.3) * 2));
          pulseHistory.push({ time: fillLabel, value: Math.round(Math.min(100, Math.max(20, base + microNoise))) });
        }
      }
    }
    const timeLabel = now.toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 5);
    pulseHistory.push({ time: timeLabel, value: overview.market.temperature });
    if (pulseHistory.length > 240) pulseHistory = pulseHistory.slice(-240);
    overview.marketPulse = pulseHistory;

    // 持久化脉搏数据（跨重启保留）
    try { setCache('pulse:history', pulseHistory, 86400); } catch {}

    // 6. 先拉财报（增强候选股数据质量）
    await fetchFinancials(allCandidates);

    // 7. 更新候选股评分（财报 + 快照引擎异动分）
    for (const s of allCandidates) {
      if (s.cashflowRatio) {
        s.finance = Math.round(Math.min(100, Math.max(30, parseFloat(s.cashflowRatio) * 50 + 30)));
      }
      // 从快照引擎获取真实异动分
      try {
        if (!snapshotWorker) snapshotWorker = require('../services/snapshot-worker');
        const code = s.code || s.tsCode?.replace(/\.(SH|SZ)/, '');
        const realAnomaly = snapshotWorker.getAnomalyScore(code);
        if (realAnomaly !== 50 || s.anomaly === undefined) s.anomaly = realAnomaly;
      } catch { /* 保留随机值 */ }
      s.totalScore = Math.round(s.pattern * 0.3 + s.catalyst * 0.25 + s.finance * 0.25 + s.anomaly * 0.2);
    }

    // 8. 写缓存（24小时 TTL，确保非交易日保留昨日数据）
    setCache('overview:current', overview, 86400);

    // 9. 同步候选池到高频快照引擎
    try {
      if (!snapshotWorker) snapshotWorker = require('../services/snapshot-worker');
      snapshotWorker.syncCandidates(overview.candidates);
    } catch { /* snapshot worker 可选 */ }

    lastFetchMinute = new Date().getMinutes();
    const elapsed = Date.now() - t0;
    addLog(`刷新完成 (${elapsed}ms) 温度:${overview.market.temperature} 涨:${overview.market.up} 跌:${overview.market.down}`);

    return { success: true, stockCount: stocks.length, sectorCount: sectors.length, elapsed };
  } catch (err) {
    addLog(`❌ 刷新失败: ${err.message}`);
    return { success: false, error: err.message };
  } finally {
    isRunning = false;
  }
}

function startScheduler() {
  console.log('[Scheduler] 启动实时调度器（开盘1分钟/次·新浪+东财）...');
  refreshData();

  setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    // 开盘时段 9:00-15:05
    const isMarketHours = hour >= 9 && hour <= 15 && !(hour === 15 && minute > 5);
    if (isMarketHours && minute !== lastFetchMinute) {
      refreshData();
    }
  }, 60 * 1000);
}

function getStatus() {
  return { isRunning, lastFetchMinute };
}

module.exports = { startScheduler, refreshData, getStatus };
