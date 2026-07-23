/**
 * 候选池 3 秒高频快照引擎
 * - 每 3 秒拉取候选池新浪实时快照
 * - 维护每只股票 120 条滚动快照（6 分钟历史）
 * - 实时计算 5 条监测规则，生成异动告警
 * - 告警写入内存供 SSE 推送
 */

const { batchRequest } = require('./eastmoney');

// ---- 配置 ----
const INTERVAL_MS = 3000;        // 3 秒间隔
const WINDOW_SIZE = 120;         // 保留 120 条快照 = 6 分钟
const BASELINE_MIN = 20;         // 量能基线最少需要 20 条（1 分钟）

// ---- 状态 ----
/** @type {Map<string, {code:string, name:string, snapshots:Array}>} */
const tickStore = new Map();

/** @type {Array<{time:string, level:string, title:string, detail:string, code:string}>} */
let liveAlerts = [];

let isRunning = false;
let timer = null;
let pollCount = 0;
let lastPollMs = 0;

// ---- 新浪代码转换 ----
function toSinaCode(tsCode) {
  // tsCode: '600519.SH' → 'sh600519'
  if (!tsCode) return null;
  if (tsCode.endsWith('.SH')) return 'sh' + tsCode.replace('.SH', '');
  if (tsCode.endsWith('.SZ')) return 'sz' + tsCode.replace('.SZ', '');
  return null;
}

// ---- 解析新浪快照 ----
function parseSnapshot(line) {
  const match = line.match(/hq_str_(sh|sz)(\d+)="(.+)"/);
  if (!match) return null;
  const code = match[2];
  const fields = match[3].split(',');
  if (fields.length < 30) return null;

  const name = fields[0];
  const open = parseFloat(fields[1]) || 0;
  const preClose = parseFloat(fields[2]) || 0;
  const price = parseFloat(fields[3]) || 0;
  const high = parseFloat(fields[4]) || 0;
  const low = parseFloat(fields[5]) || 0;
  const volume = parseFloat(fields[8]) || 0;    // 手
  const amount = parseFloat(fields[9]) || 0;     // 元
  const date = fields[30] || '';

  if (price <= 0 || !name) return null;

  return {
    code,
    name,
    price,
    open,
    high,
    low,
    preClose,
    volume,
    amount,
    pctChg: preClose > 0 ? ((price - preClose) / preClose * 100) : 0,
    time: date ? date.slice(0, 10) + ' ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) : new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    at: Date.now()
  };
}

// ---- 更新滚动窗口 ----
function updateStore(snapshots) {
  const now = Date.now();
  for (const s of snapshots) {
    if (!s || !s.code) continue;
    let entry = tickStore.get(s.code);
    if (!entry) {
      entry = { code: s.code, name: s.name, snapshots: [] };
      tickStore.set(s.code, entry);
    }
    entry.name = s.name; // 名称可能变化（更名等）
    entry.snapshots.push(s);
    // 只保留最近 WINDOW_SIZE 条
    if (entry.snapshots.length > WINDOW_SIZE) {
      entry.snapshots.shift();
    }
    // 清理超过 10 分钟的旧数据
    const cutoff = now - 10 * 60 * 1000;
    entry.snapshots = entry.snapshots.filter(sn => sn.at > cutoff);
  }
}

// ---- 监测规则 1: 成交量暴增 ----
function checkVolumeSpike(code, entry) {
  const snaps = entry.snapshots;
  if (snaps.length < BASELINE_MIN) return null;

  const latest = snaps[snaps.length - 1];
  const recent = snaps.slice(-10, -1); // 前 9 条（30 秒内）

  if (recent.length < 5) return null;
  const avgVol = recent.reduce((s, sn) => s + sn.volume, 0) / recent.length;
  if (avgVol < 100) return null; // 忽略小盘冷门股

  const ratio = latest.volume / avgVol;
  if (ratio >= 1.8) { // 量能达到近期均量 1.8 倍
    return {
      level: ratio >= 5 ? 'critical' : 'high',
      title: '成交量暴增',
      detail: `${entry.name} 当前分钟量能 ${(latest.volume / 100).toFixed(0)} 手，达近期均量 ${ratio.toFixed(1)} 倍`,
      code
    };
  }
  return null;
}

// ---- 监测规则 2: 5 分钟涨速 ----
function checkSpeedRise(code, entry) {
  const snaps = entry.snapshots;
  // 5 分钟 = 100 条快照前
  const idx = snaps.length - 100;
  if (idx < 0) return null;

  const latest = snaps[snaps.length - 1];
  const old = snaps[idx];
  const pctChange = ((latest.price - old.price) / old.price * 100);

  if (pctChange >= 0.8) { // 5 分钟内涨 0.8%
    return {
      level: pctChange >= 4 ? 'critical' : pctChange >= 2.5 ? 'high' : 'medium',
      title: '5分钟急拉',
      detail: `${entry.name} 5分钟内涨幅 ${pctChange.toFixed(2)}%，现价 ${latest.price.toFixed(2)}`,
      code
    };
  }
  return null;
}

// ---- 监测规则 3: 换手加速度 ----
function checkTurnoverAccel(code, entry) {
  // 从成交量增速推断换手变化（新浪快照不含实时换手率）
  const snaps = entry.snapshots;
  if (snaps.length < BASELINE_MIN) return null;

  // 计算近 10 条和更早 10 条的成交量均值
  const group2 = snaps.slice(-10);
  const group1 = snaps.slice(-20, -10);

  if (group1.length < 5) return null;
  const avg1 = group1.reduce((s, sn) => s + sn.volume, 0) / group1.length;
  const avg2 = group2.reduce((s, sn) => s + sn.volume, 0) / group2.length;
  if (avg1 < 50) return null;

  // Z-Score 近似：量能翻倍
  const accel = avg2 / avg1;
  if (accel >= 2.5) {
    return {
      level: accel >= 5 ? 'high' : 'medium',
      title: '换手加速',
      detail: `${entry.name} 近30秒量能较此前翻 ${accel.toFixed(1)} 倍，关注异动`,
      code
    };
  }
  return null;
}

// ---- 监测规则 4: 板块联动 ----
function checkSectorLinkage(sectorMap) {
  // sectorMap: { 板块名: [{code, name, pctChg}] }
  const alerts = [];
  for (const [sector, stocks] of sectorMap) {
    if (stocks.length < 5) continue;
    const upCount = stocks.filter(s => s.pctChg > 0).length;
    const ratio = upCount / stocks.length;
    const avgPct = stocks.reduce((s, st) => s + st.pctChg, 0) / stocks.length;

    if (ratio >= 0.7 && avgPct > 1.5) {
      alerts.push({
        level: avgPct > 4 ? 'high' : 'medium',
        title: '板块联动',
        detail: `${sector} ${upCount}/${stocks.length} 只同步上涨，均涨幅 ${avgPct.toFixed(1)}%`,
        code: sector
      });
    }
  }
  return alerts;
}

// ---- 监测规则 5: 高位退潮信号 ----
function checkRetreat(code, entry) {
  const snaps = entry.snapshots;
  if (snaps.length < 30) return null;

  const latest = snaps[snaps.length - 1];
  const peakIdx = snaps.length - 30;
  let peak = 0;
  for (let i = peakIdx; i < snaps.length - 1; i++) {
    peak = Math.max(peak, snaps[i].price);
  }

  if (peak <= 0 || latest.price >= peak * 0.95) return null;

  // 从高点回落超过 3%（非跌停的正常回落也有可能是退潮）
  const drawdown = (peak - latest.price) / peak * 100;
  // 同时量能放大 → 恐慌出逃
  const recentVol = snaps.slice(-5).reduce((s, sn) => s + sn.volume, 0);
  const earlierVol = snaps.slice(-20, -5).reduce((s, sn) => s + sn.volume, 0);
  const volRatio = earlierVol > 0 ? recentVol / earlierVol * 3 : 0; // *3 归一化到 15 条 vs 5 条

  if (drawdown > 3 && volRatio > 1.3) {
    return {
      level: drawdown > 7 ? 'critical' : 'high',
      title: '高位退潮',
      detail: `${entry.name} 从高点回落 ${drawdown.toFixed(1)}% 且量能放大 ${volRatio.toFixed(1)} 倍`,
      code
    };
  }
  return null;
}

// ---- 主轮询函数 ----
async function poll() {
  pollCount++;
  const t0 = Date.now();

  try {
    // 1. 收集候选池股票代码
    const codes = [];
    const candidates = [];
    for (const [code, entry] of tickStore) {
      // code 可能带后缀 (688806.SH) 或不带 (688806)，统一转换
      let tsCode = code;
      if (code.endsWith('.SH') || code.endsWith('.SZ')) {
        tsCode = code; // 已带后缀
      } else if (code.startsWith('6') || code.startsWith('5')) {
        tsCode = code + '.SH';
      } else {
        tsCode = code + '.SZ';
      }
      const sinaCode = toSinaCode(tsCode);
      if (sinaCode) {
        codes.push(sinaCode);
        const latest = entry.snapshots[entry.snapshots.length - 1];
        if (latest) {
          candidates.push({ code, name: entry.name, pctChg: latest.pctChg, sector: '' });
        }
      }
    }

    // 如果 store 为空，尝试从缓存初始化候选池
    if (codes.length === 0) {
      const { getCache } = require('./cache');
      const overview = getCache('overview:current');
      if (overview?.candidates?.length > 0) {
        syncCandidates(overview.candidates);
        // 从 tickStore 重建 codes（syncCandidates 已填充 tickStore）
        for (const [code, entry] of tickStore) {
          let tsCode = code;
          if (!code.endsWith('.SH') && !code.endsWith('.SZ')) {
            tsCode = code + (code.startsWith('6') || code.startsWith('5') ? '.SH' : '.SZ');
          }
          const sc = toSinaCode(tsCode);
          if (sc) codes.push(sc);
        }
        if (codes.length > 0 && pollCount <= 1) {
          console.log('[Snapshot] 从缓存初始化候选池 (' + codes.length + ' 只)');
        }
      }
    }

    if (codes.length === 0) {
      lastPollMs = Date.now() - t0;
      return;
    }

    // 2. 拉取新浪快照（batchRequest 已返回解析好的对象）
    const snapshots = await batchRequest(codes);

    // 3. 更新滚动窗口
    if (snapshots.length > 0) {
      // batchRequest 返回的对象用 tsCode 作为 code，统一补上
      for (const s of snapshots) {
        if (!s.at) s.at = Date.now();
        if (!s.time) s.time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        // batchRequest 返回的字段名略有不同，做映射
        s.code = s.code || s.tsCode?.replace(/\.(SH|SZ)/, '');
        s.volume = s.volume || 0;
        s.amount = s.amount || 0;
      }
      updateStore(snapshots);
    }

    // 4. 执行监测规则
    const newAlerts = [];

    for (const [code, entry] of tickStore) {
      const snaps = entry.snapshots;
      if (snaps.length < 5) continue;

      // 0. 价格异动（15 秒窗口，最灵敏）
      const latest = snaps[snaps.length - 1];
      const prev15s = snaps[Math.max(0, snaps.length - 5)];
      const move15s = (latest.price - prev15s.price) / prev15s.price * 100;
      if (Math.abs(move15s) >= 0.5) {
        newAlerts.push({
          level: Math.abs(move15s) >= 1.5 ? 'high' : 'medium',
          title: move15s > 0 ? '快速拉升' : '快速回落',
          detail: `${entry.name} 15秒内${move15s > 0 ? '涨' : '跌'} ${Math.abs(move15s).toFixed(2)}%，现价 ${latest.price.toFixed(2)}`,
          code
        });
      }

      if (snaps.length < BASELINE_MIN) continue;

      // 1. 量能暴增
      const a1 = checkVolumeSpike(code, entry);
      if (a1) newAlerts.push(a1);

      // 2. 5 分钟涨速
      const a2 = checkSpeedRise(code, entry);
      if (a2) newAlerts.push(a2);

      // 3. 换手加速
      const a3 = checkTurnoverAccel(code, entry);
      if (a3) newAlerts.push(a3);

      // 5. 高位退潮
      const a5 = checkRetreat(code, entry);
      if (a5) newAlerts.push(a5);
    }

    // 规则 4: 板块联动（需要等 scheduler 把行业信息带过来再做）

    // 5. 合并告警（去重 + 限流）
    if (newAlerts.length > 0) {
      // 去重：同一只股票同一标题 3 秒内不重复（跟上快照节奏）
      const cutoff = Date.now() - 3000;
      const seen = new Set();
      for (const a of liveAlerts) {
        if (a._at > cutoff) seen.add(a.code + '|' + a.title);
      }

      for (const a of newAlerts) {
        const key = a.code + '|' + a.title;
        if (!seen.has(key)) {
          a.time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
          a._at = Date.now();
          liveAlerts.unshift(a);
          seen.add(key);
        }
      }
      // 只保留最近 100 条
      liveAlerts = liveAlerts.slice(0, 100);
    }

    lastPollMs = Date.now() - t0;
  } catch (err) {
    lastPollMs = Date.now() - t0;
    // 静默失败，下轮重试
  }
}

// ---- 对外接口 ----

function start() {
  if (isRunning) return;
  isRunning = true;
  console.log('[Snapshot] 启动 3 秒高频快照引擎（候选池分钟级扫描）');
  poll(); // 首次立即执行
  timer = setInterval(poll, INTERVAL_MS);
}

function stop() {
  isRunning = false;
  if (timer) { clearInterval(timer); timer = null; }
}

function getAlerts() {
  return liveAlerts.slice(0, 20);
}

function getStatus() {
  return {
    isRunning,
    pollCount,
    lastPollMs,
    stocksMonitored: tickStore.size,
    alertsCount: liveAlerts.length,
    memoryKB: Math.round(process.memoryUsage?.()?.heapUsed / 1024 || 0)
  };
}

/**
 * 返回候选股异动分数（替代随机数）
 */
function getAnomalyScore(code) {
  const entry = tickStore.get(code);
  if (!entry || entry.snapshots.length < BASELINE_MIN) return 50; // 默认值

  const snaps = entry.snapshots;
  const latest = snaps[snaps.length - 1];
  const recent5 = snaps.slice(-5);

  // 量能异常度
  const recentAvgVol = recent5.reduce((s, sn) => s + sn.volume, 0) / recent5.length;
  const earlier20 = snaps.slice(-25, -5);
  const earlierAvgVol = earlier20.length > 0
    ? earlier20.reduce((s, sn) => s + sn.volume, 0) / earlier20.length
    : recentAvgVol;
  const volScore = Math.min(50, (recentAvgVol / Math.max(1, earlierAvgVol)) * 20);

  // 价格动量
  const priceDelta = latest.price - (snaps[snaps.length - 10]?.price || latest.price);
  const priceScore = Math.min(30, Math.abs(priceDelta / latest.price * 100) * 5);

  // 综合
  return Math.round(Math.min(100, 40 + volScore + priceScore));
}

/**
 * 初始化/更新候选池（由 scheduler 调用）
 */
function syncCandidates(candidates) {
  const keepCodes = new Set();
  for (const c of candidates) {
    const raw = c.code || c.tsCode || '';
    const code = raw.replace(/\.(SH|SZ)/, '');
    if (!code || code.length < 6) continue;
    keepCodes.add(code);

    if (!tickStore.has(code)) {
      tickStore.set(code, { code, name: c.name, snapshots: [] });
    } else {
      tickStore.get(code).name = c.name;
    }
  }
  // 清理不在当前候选池的股票
  for (const code of tickStore.keys()) {
    if (!keepCodes.has(code)) tickStore.delete(code);
  }
}

module.exports = { start, stop, getAlerts, getStatus, getAnomalyScore, syncCandidates };
