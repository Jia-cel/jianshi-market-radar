/**
 * 新浪财经免费实时行情 API
 * hq.sinajs.cn — 国内直连，无需 Token，格式简单
 */
require('dns').setDefaultResultOrder('ipv4first');

const https = require('https');
const iconv = require('iconv-lite');

/**
 * 生成全量 A 股代码列表
 */
function generateAllCodes() {
  const codes = [];
  for (let i = 600000; i <= 605999; i++) codes.push(`sh${i}`);
  for (let i = 0; i <= 3999; i++) codes.push(`sz${String(i).padStart(6, '0')}`);
  for (let i = 300000; i <= 301999; i++) codes.push(`sz${i}`);
  return codes;
}

/**
 * 解析新浪股票数据行
 * var hq_str_sh600000="名称,今开,昨收,现价,最高,最低,..."
 */
function parseLine(line) {
  const match = line.match(/hq_str_(sh|sz)(\d+)="(.+)"/);
  if (!match) return null;

  const market = match[1] === 'sh' ? 'SH' : 'SZ';
  const code = match[2];
  const fields = match[3].split(',');
  if (fields.length < 30) return null;

  const name = fields[0];
  const open = parseFloat(fields[1]) || 0;
  const preClose = parseFloat(fields[2]) || 0;
  const price = parseFloat(fields[3]) || 0;
  const high = parseFloat(fields[4]) || 0;
  const low = parseFloat(fields[5]) || 0;
  const volume = parseFloat(fields[8]) || 0;
  const amount = parseFloat(fields[9]) || 0;

  if (price <= 0 || !name) return null;

  const pctChg = preClose > 0 ? ((price - preClose) / preClose * 100) : 0;

  return {
    code, market,
    tsCode: `${code}.${market}`,
    name, price,
    pctChg: Math.round(pctChg * 100) / 100,
    change: Math.round((price - preClose) * 100) / 100,
    volume, amount,
    high, low, open, preClose,
    industry: '', time: ''
  };
}

/**
 * 批量请求新浪接口
 */
function batchRequest(codes) {
  return new Promise((resolve) => {
    const url = `https://hq.sinajs.cn/list=${codes.join(',')}`;
    const req = https.get(url, {
      headers: { 'Referer': 'https://finance.sina.com.cn', 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    }, (res) => {
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const data = iconv.decode(buffer, 'gbk');
        const stocks = data.split('\n')
          .filter(l => l.includes('="'))
          .map(parseLine)
          .filter(Boolean);
        resolve(stocks);
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

/**
 * 获取全市场实时行情
 * @param {string[]} validCodes - 有效的股票代码列表（如 ['600000.SH', '000001.SZ']），不传则尝试全部
 */
async function getAllStocks(validCodes = null) {
  // 从 Tushare codes 转为新浪格式
  let sinaCodes;
  if (validCodes && validCodes.length > 0) {
    sinaCodes = validCodes.map(c => {
      if (c.endsWith('.SH')) return 'sh' + c.replace('.SH', '');
      if (c.endsWith('.SZ')) return 'sz' + c.replace('.SZ', '');
      return null;
    }).filter(Boolean);
  } else {
    sinaCodes = generateAllCodes();
  }

  const batchSize = 400;
  const concurrency = 3;
  const allStocks = [];

  for (let i = 0; i < sinaCodes.length; i += batchSize * concurrency) {
    const batchPromises = [];
    for (let j = 0; j < concurrency; j++) {
      const start = i + j * batchSize;
      const batch = sinaCodes.slice(start, start + batchSize);
      if (batch.length === 0) break;
      batchPromises.push(batchRequest(batch));
    }
    const results = await Promise.all(batchPromises);
    for (const r of results) allStocks.push(...r);
    if (i + batchSize * concurrency < sinaCodes.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return allStocks;
}

/**
 * 通用东财板块请求
 * @param {string} type - 2=行业板块, 3=概念板块
 * @param {number} pz - 每页数量
 */
function fetchEMBoard(type, pz = 80) {
  return new Promise((resolve) => {
    const url = `https://push2his.eastmoney.com/api/qt/clist/get?pn=1&pz=${pz}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:${type}&fields=f2,f3,f4,f12,f14,f20,f104,f105,f128,f152`;
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          const items = (json.data?.diff || []).map(item => ({
            code: item.f12,
            name: item.f14,
            pctChg: item.f3 || 0,
            amount: item.f20 || 0,
            upCount: item.f104 || 0,
            downCount: item.f105 || 0,
            turnoverRate: item.f152 || 0,
            leadStockName: '',
            boardType: type === '3' ? '概念' : '行业'
          }));
          resolve(items);
        } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.on('timeout', () => { req.destroy(); resolve([]); });
  });
}

/**
 * 获取行业板块——东方财富行业板块 API（t:2）
 */
function getSectors() {
  return fetchEMBoard('2', 50);
}

/**
 * 获取概念板块——东方财富概念板块 API（t:3）
 * 这是热点板块的主要数据源，包含"人形机器人""低空经济"等热门概念
 */
function getConcepts() {
  return fetchEMBoard('3', 80);
}

/**
 * 市场指数
 */
async function getMarketIndex() {
  const ids = ['s_sh000001', 's_sz399001', 's_sz399006'];
  const stocks = await batchRequest(ids);
  const result = {};
  for (const s of stocks) {
    if (s.code === '000001') result.sh = { price: s.price, pctChg: s.pctChg, amount: s.amount };
    if (s.code === '399001') result.sz = { price: s.price, pctChg: s.pctChg, amount: s.amount };
    if (s.code === '399006') result.cy = { price: s.price, pctChg: s.pctChg, amount: s.amount };
  }
  return result;
}

module.exports = { getAllStocks, getSectors, getConcepts, getMarketIndex, batchRequest };
