/**
 * Tushare HTTP API 封装
 * 文档: https://tushare.pro/document/1
 *
 * 免费积分 (120) 可用的核心接口:
 *   stock_basic, trade_cal, daily, ths_daily, ths_member, index_dailybasic
 */

const TUSHARE_URL = 'https://api.tushare.pro';
const TOKEN = process.env.TUSHARE_TOKEN || '';

// 请求限流: 免费用户每分钟 200 次
let requestCount = 0;
let resetTime = Date.now() + 60000;

async function request(apiName, params = {}, fields = '') {
  // 简单的请求限流
  if (Date.now() > resetTime) {
    requestCount = 0;
    resetTime = Date.now() + 60000;
  }
  if (requestCount >= 180) {
    const wait = resetTime - Date.now();
    if (wait > 0) {
      console.log(`Tushare rate limit, waiting ${Math.ceil(wait / 1000)}s...`);
      await new Promise(r => setTimeout(r, wait + 1000));
      requestCount = 0;
      resetTime = Date.now() + 60000;
    }
  }
  requestCount++;

  const body = {
    api_name: apiName,
    token: TOKEN,
    params: params,
    fields: fields
  };

  const response = await fetch(TUSHARE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json();

  if (result.code !== 0) {
    throw new Error(`Tushare ${apiName} error: ${result.msg || 'unknown'}`);
  }

  // 按字段名映射为对象数组，而不是依赖列顺序
  const data = result.data;
  if (data && data.fields && data.items) {
    const mapped = data.items.map(row => {
      const obj = {};
      data.fields.forEach((field, i) => {
        obj[field] = row[i];
      });
      return obj;
    });
    return { fields: data.fields, items: mapped, mapped };
  }

  return data;
}

/**
 * 获取交易日历
 */
async function getTradeCal(startDate, endDate) {
  const data = await request('trade_cal', {
    exchange: 'SSE',
    start_date: startDate,
    end_date: endDate,
    is_open: 1
  });
  return (data?.items || []).map(row => row[1]); // cal_date
}

/**
 * 获取股票基本信息
 */
async function getStockBasic() {
  const data = await request('stock_basic', {
    exchange: '',
    list_status: 'L',
    fields: 'ts_code,symbol,name,area,industry,market,list_date'
  });
  return (data?.mapped || data?.items || []).map(r => ({
    ts_code: r.ts_code || r[0],
    symbol: r.symbol || r[1],
    name: r.name || r[2],
    area: r.area || r[3],
    industry: r.industry || r[4],
    market: r.market || r[5],
    list_date: r.list_date || r[6]
  }));
}

/**
 * 获取日线行情
 * @param {string} tradeDate 交易日期 YYYYMMDD
 */
async function getDailyData(tradeDate) {
  const data = await request('daily', {
    trade_date: tradeDate,
    fields: 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount'
  });
  return (data?.mapped || data?.items || []).map(r => ({
    ts_code: r.ts_code || r[0],
    trade_date: r.trade_date || r[1],
    open: parseFloat(r.open || r[2]) || 0,
    high: parseFloat(r.high || r[3]) || 0,
    low: parseFloat(r.low || r[4]) || 0,
    close: parseFloat(r.close || r[5]) || 0,
    pre_close: parseFloat(r.pre_close || r[6]) || 0,
    change: parseFloat(r.change || r[7]) || 0,
    pct_chg: parseFloat(r.pct_chg || r[8]) || 0,
    vol: parseFloat(r.vol || r[9]) || 0,
    amount: parseFloat(r.amount || r[10]) || 0
  }));
}

/**
 * 获取同花顺板块日行情
 */
async function getThsDaily(tradeDate) {
  const data = await request('ths_daily', {
    trade_date: tradeDate,
    fields: 'ts_code,trade_date,open,close,pct_chg,vol,amount,turnover_rate,pe, pb'
  });
  return (data?.items || []).map(row => ({
    ts_code: row[0],
    trade_date: row[1],
    open: parseFloat(row[2]),
    close: parseFloat(row[3]),
    pct_chg: parseFloat(row[4]),
    vol: parseFloat(row[5]),
    amount: parseFloat(row[6]),
    turnover_rate: row[7] ? parseFloat(row[7]) : 0,
    pe: row[8] ? parseFloat(row[8]) : 0,
    pb: row[9] ? parseFloat(row[9]) : 0
  }));
}

/**
 * 获取同花顺板块成分股
 */
async function getThsMembers(tsCode) {
  const data = await request('ths_member', {
    ts_code: tsCode,
    fields: 'ts_code,con_code,name'
  });
  return (data?.items || []).map(row => ({
    sector_code: row[0],
    stock_code: row[1],
    stock_name: row[2]
  }));
}

/**
 * 获取指数日线（上证综指等）
 */
async function getIndexDaily(tradeDate, indexCode = '000001.SH') {
  const data = await request('index_dailybasic', {
    trade_date: tradeDate,
    ts_code: indexCode,
    fields: 'ts_code,trade_date,total_mv,float_mv,pe,turnover_rate,volume_ratio'
  });
  return (data?.items || []).map(row => ({
    ts_code: row[0],
    trade_date: row[1],
    total_mv: parseFloat(row[2]),
    float_mv: parseFloat(row[3]),
    pe: parseFloat(row[4]),
    turnover_rate: parseFloat(row[5]),
    volume_ratio: parseFloat(row[6])
  }));
}

/**
 * 获取利润表（需 2000 积分）
 */
async function getIncome(tsCode) {
  const data = await request('income', {
    ts_code: tsCode,
    fields: 'ts_code,end_date,report_type,total_revenue,revenue,operate_profit,total_profit,n_income,deducted_net_profit,basic_eps',
    limit: '8'
  });
  return (data?.mapped || []).map(r => ({
    ts_code: r.ts_code,
    end_date: r.end_date,
    report_type: r.report_type,
    total_revenue: parseFloat(r.total_revenue) || 0,
    revenue: parseFloat(r.revenue) || 0,
    operate_profit: parseFloat(r.operate_profit) || 0,
    total_profit: parseFloat(r.total_profit) || 0,
    n_income: parseFloat(r.n_income) || 0,
    deducted_net_profit: parseFloat(r.deducted_net_profit) || 0,
    basic_eps: parseFloat(r.basic_eps) || 0
  }));
}

/**
 * 获取资产负债表（需 2000 积分）
 */
async function getBalanceSheet(tsCode) {
  const data = await request('balancesheet', {
    ts_code: tsCode,
    fields: 'ts_code,end_date,report_type,total_assets,total_liab,total_hldr_eqy_inc_min_int,accounts_receiv,inventories,goodwill',
    limit: '8'
  });
  return (data?.mapped || []).map(r => ({
    ts_code: r.ts_code,
    end_date: r.end_date,
    report_type: r.report_type,
    total_assets: parseFloat(r.total_assets) || 0,
    total_liab: parseFloat(r.total_liab) || 0,
    total_equity: parseFloat(r.total_hldr_eqy_inc_min_int) || 0,
    accounts_receiv: parseFloat(r.accounts_receiv) || 0,
    inventories: parseFloat(r.inventories) || 0,
    goodwill: parseFloat(r.goodwill) || 0
  }));
}

/**
 * 获取现金流量表（需 2000 积分）
 */
async function getCashFlow(tsCode) {
  const data = await request('cashflow', {
    ts_code: tsCode,
    fields: 'ts_code,end_date,report_type,n_cashflow_act,cash_recp_sg_and_rs',
    limit: '8'
  });
  return (data?.mapped || []).map(r => ({
    ts_code: r.ts_code,
    end_date: r.end_date,
    report_type: r.report_type,
    n_cashflow_act: parseFloat(r.n_cashflow_act) || 0,
    cash_recp_sg_and_rs: parseFloat(r.cash_recp_sg_and_rs) || 0
  }));
}

module.exports = {
  request,
  getTradeCal,
  getStockBasic,
  getDailyData,
  getThsDaily,
  getThsMembers,
  getIndexDaily,
  getIncome,
  getBalanceSheet,
  getCashFlow
};
