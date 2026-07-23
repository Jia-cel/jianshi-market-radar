const express = require('express');
const router = express.Router();

// ============================================================
// 交易日判断工具
// ============================================================
function getTradingStatus() {
  const now = new Date();
  const day = now.getDay(); // 0=周日, 6=周六
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeVal = hour * 60 + minute;

  const isWeekday = day >= 1 && day <= 5;

  // A股交易时段: 9:30-11:30, 13:00-15:00（调度器放宽到 9:00-15:05）
  const morningStart = 9 * 60 + 30;
  const morningEnd = 11 * 60 + 30;
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60 + 5;

  const inTradingHours = (timeVal >= morningStart && timeVal <= morningEnd) ||
    (timeVal >= afternoonStart && timeVal <= afternoonEnd);

  let status, label;
  if (!isWeekday) {
    status = 'weekend';
    label = '周末休市';
  } else if (inTradingHours) {
    status = 'trading';
    label = '交易中';
  } else if (timeVal < morningStart) {
    status = 'pre-market';
    label = '盘前';
  } else if (timeVal < afternoonStart && timeVal > morningEnd) {
    status = 'lunch-break';
    label = '午间休市';
  } else {
    status = 'after-hours';
    label = '已收盘';
  }

  return {
    isTradingTime: inTradingHours && isWeekday,
    isWeekday,
    status,
    label,
    clock: now.toLocaleTimeString('zh-CN', { hour12: false })
  };
}

// ============================================================
// 模拟数据（fallback：当调度器未拉取到数据时使用）
// ============================================================
const MOCK_DATA = {
  market: {
    tradeDate: new Date().toISOString().slice(0, 10), clock: new Date().toLocaleTimeString('zh-CN', { hour12: false }), status: '盘后数据',
    temperature: 76, up: 3286, down: 1649, flat: 112,
    turnover: 6842, turnoverDelta: 18.6, limitUp: 61, limitDown: 7,
    maxBoard: 5, risk: '中等'
  },
  sectors: [
    { id: 'robot', name: '人形机器人', score: 92, change: 5.82, turnover: 438.6, turnoverRate: 7.8, breadth: 78, momentum: 88, stage: '发酵', stageTone: 'hot', days: 4, catalyst: '产业链订单与量产预期升温', keywords: ['灵巧手', '减速器', '量产'], spark: [26, 30, 29, 38, 45, 51, 60, 73, 76, 92] },
    { id: 'chip', name: '先进封装', score: 86, change: 4.31, turnover: 326.2, turnoverRate: 6.2, breadth: 71, momentum: 81, stage: '启动', stageTone: 'up', days: 2, catalyst: '国产算力扩产带动封装需求', keywords: ['HBM', 'Chiplet', '扩产'], spark: [24, 23, 28, 31, 29, 37, 42, 51, 67, 86] },
    { id: 'power', name: '电网设备', score: 79, change: 3.12, turnover: 271.8, turnoverRate: 4.9, breadth: 64, momentum: 72, stage: '发酵', stageTone: 'hot', days: 5, catalyst: '特高压建设与设备更新预期', keywords: ['特高压', '出海', '设备更新'], spark: [38, 41, 44, 49, 54, 58, 64, 69, 75, 79] },
    { id: 'medicine', name: '创新药', score: 73, change: 2.46, turnover: 219.4, turnoverRate: 3.7, breadth: 59, momentum: 61, stage: '分歧', stageTone: 'warn', days: 7, catalyst: '授权交易催化仍在，内部开始分化', keywords: ['BD', '临床数据', '出海'], spark: [35, 44, 52, 66, 76, 84, 88, 83, 77, 73] },
    { id: 'consumer', name: '新消费', score: 61, change: 1.38, turnover: 184.7, turnoverRate: 3.1, breadth: 52, momentum: 48, stage: '潜伏', stageTone: 'quiet', days: 1, catalyst: '消费数据改善与新品发布', keywords: ['国货', '新品', '渠道'], spark: [31, 28, 33, 35, 32, 39, 41, 44, 53, 61] },
    { id: 'lowalt', name: '低空经济', score: 54, change: -0.72, turnover: 307.3, turnoverRate: 8.1, breadth: 33, momentum: 34, stage: '退潮', stageTone: 'down', days: 9, catalyst: '前期热点降温，等待新订单验证', keywords: ['适航证', '订单', '基建'], spark: [86, 90, 84, 79, 71, 68, 63, 59, 56, 54] }
  ],
  candidates: [
    { code: '688017', name: '绿的谐波', sector: '人形机器人', price: 142.80, change: 7.42, totalScore: 91, pattern: 94, catalyst: 88, finance: 82, anomaly: 96, signal: '强确认', signalTone: 'strong', profitTrend: [1.8, 2.4, 3.1, 4.2], revenueTrend: [7.2, 8.6, 10.3, 12.8], reason: '平台整理后放量突破，板块同步扩散', tags: ['图形高度匹配', '扣非三期增长'] },
    { code: '002156', name: '通富微电', sector: '先进封装', price: 38.50, change: 5.16, totalScore: 86, pattern: 89, catalyst: 84, finance: 87, anomaly: 82, signal: '已触发', signalTone: 'active', profitTrend: [5.1, 7.0, 9.8, 12.5], revenueTrend: [46, 58, 69, 91], reason: '5分钟量能达到同期3.1倍，突破前高', tags: ['订单催化', '现金流改善'] },
    { code: '002028', name: '思源电气', sector: '电网设备', price: 52.30, change: 3.28, totalScore: 80, pattern: 83, catalyst: 78, finance: 91, anomaly: 69, signal: '观察', signalTone: 'watch', profitTrend: [26, 28, 35, 47], revenueTrend: [109, 121, 139, 161], reason: '趋势完整，盘中量能尚未达到触发阈值', tags: ['盈利质量高', '等待放量'] },
    { code: '600276', name: '恒瑞医药', sector: '创新药', price: 51.20, change: 1.63, totalScore: 72, pattern: 77, catalyst: 86, finance: 75, anomaly: 51, signal: '观察', signalTone: 'watch', profitTrend: [39, 43, 47, 61], revenueTrend: [213, 228, 245, 268], reason: '催化明确，但板块处于分歧阶段', tags: ['BD预期', '板块分歧'] }
  ],
  alerts: [
    { time: '10:26:18', level: 'critical', title: '量价共振', detail: '绿的谐波 5分钟成交额达到历史同期 3.6 倍，突破观察位', code: '688017' },
    { time: '10:21:04', level: 'high', title: '板块扩散', detail: '人形机器人上涨覆盖率升至 78%，12只成分股同步放量', code: 'robot' },
    { time: '10:14:36', level: 'medium', title: '换手加速', detail: '通富微电换手率斜率进入全市场前 3%，价格位于日内高位', code: '002156' },
    { time: '10:06:52', level: 'low', title: '阶段变化', detail: '创新药内部强弱分化扩大：发酵 → 分歧', code: 'medicine' }
  ],
  marketPulse: [
    { time: '09:30', value: 42 }, { time: '09:40', value: 51 }, { time: '09:50', value: 48 },
    { time: '10:00', value: 58 }, { time: '10:10', value: 64 }, { time: '10:20', value: 73 },
    { time: '10:30', value: 77 }, { time: '10:40', value: 74 }, { time: '10:50', value: 82 }, { time: '11:00', value: 85 }
  ],
  catalystFeed: [
    { time: '09:56', type: '产业', title: '核心零部件量产节奏加快', sector: '人形机器人', impact: '高', source: '产业资讯' },
    { time: '09:31', type: '公告', title: '公司披露新产线建设进展', sector: '先进封装', impact: '中', source: '公司公告' },
    { time: '08:42', type: '政策', title: '新型电力系统建设支持方向更新', sector: '电网设备', impact: '高', source: '政策文件' },
    { time: '07:58', type: '公司', title: '海外授权合作取得阶段性进展', sector: '创新药', impact: '中', source: '公司公告' }
  ],
  sourceStatus: { name: '模拟行情引擎', mode: 'simulation', latencyMs: 36 },
  generatedAt: new Date().toISOString()
};

/**
 * GET /api/overview
 * 优先从缓存读取实时数据，缓存未命中则使用模拟数据
 */
router.get('/', (req, res) => {
  const tradingStatus = getTradingStatus();

  // 快照引擎实时告警
  let liveAlerts = [];
  try {
    const snapshotWorker = require('../services/snapshot-worker');
    liveAlerts = snapshotWorker.getAlerts();
  } catch { /* snapshot worker 可能未启动 */ }

  // 优先从内存/数据库读取缓存的实时数据
  const { getCache } = require('../services/cache');
  const realData = getCache('overview:current');

  if (realData) {
    // 合并快照引擎告警（排前面）和 scheduler 告警
    const mergedAlerts = [...liveAlerts, ...(realData.alerts || [])].slice(0, 20);
    return res.json({
      ...realData,
      alerts: mergedAlerts,
      tradingStatus,
      generatedAt: new Date().toISOString()
    });
  }

  // 降级：返回模拟数据，并标记非交易状态
  const data = {
    ...MOCK_DATA,
    alerts: [...liveAlerts, ...MOCK_DATA.alerts].slice(0, 20),
    tradingStatus,
    // 非交易时段用更明确的 sourceStatus
    sourceStatus: tradingStatus.isTradingTime
      ? MOCK_DATA.sourceStatus
      : { name: '模拟行情引擎（非交易时段）', mode: 'off-hours', latencyMs: 0 },
    generatedAt: new Date().toISOString()
  };
  res.json(data);
});

module.exports = router;
