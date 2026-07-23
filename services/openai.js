const OpenAI = require('openai');

let deepseek = null;
let qwen = null;

function getDeepSeek() {
  if (!deepseek && process.env.DEEPSEEK_API_KEY) {
    deepseek = new OpenAI({
      baseURL: 'https://api.deepseek.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY
    });
  }
  return deepseek;
}

function getQwen() {
  if (!qwen && process.env.QWEN_API_KEY) {
    qwen = new OpenAI({
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: process.env.QWEN_API_KEY
    });
  }
  return qwen;
}

let totalTokens = 0;

/**
 * 文本对话（DeepSeek-V4）
 */
async function chat(messages, { maxTokens = 800, temperature = 0.5 } = {}) {
  const client = getDeepSeek();
  if (!client) throw new Error('DeepSeek API key not configured');
  const response = await client.chat.completions.create({
    model: 'deepseek-v4-pro',
    messages,
    max_tokens: maxTokens,
    temperature
  });
  trackUsage(response);
  return response.choices[0]?.message?.content || '';
}

/**
 * K 线形态识别 — 通义千问 VL 视觉模型
 */
async function analyzeChartPattern(imageBase64, imageType = 'image/png') {
  if (!process.env.QWEN_API_KEY) {
    return { success: false, error: '请先配置通义千问 API Key' };
  }

  const qwenClient = getQwen();
  if (!qwenClient) return { success: false, error: '请先配置通义千问 API Key' };

  // 确保 imageBase64 是纯 base64（不含 data:xxx;base64, 前缀）
  let cleanBase64 = imageBase64;
  if (cleanBase64.includes(',')) {
    cleanBase64 = cleanBase64.split(',')[1] || cleanBase64;
  }
  cleanBase64 = cleanBase64.replace(/\s/g, '');
  // 通过 Buffer 往返确保纯 ASCII base64
  try {
    cleanBase64 = Buffer.from(cleanBase64, 'base64').toString('base64');
  } catch {
    return { success: false, error: '图片数据无效' };
  }

  const response = await qwenClient.chat.completions.create({
    model: 'qwen-vl-max',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: { url: `data:${imageType};base64,${cleanBase64}` }
        },
        {
          type: 'text',
          text: `你是一位专业A股技术分析师。请分析这张K线图，识别其中的技术形态。

请严格按 JSON 格式返回（不要包含 markdown 代码块）：
{
  "pattern": "形态名称，如：头肩顶、W底、三角形突破、旗形整理等",
  "confidence": 0.85,
  "keyLevels": {
    "support": ["支撑位1", "支撑位2"],
    "resistance": ["阻力位1", "阻力位2"]
  },
  "volumeAnalysis": "量价配合描述",
  "trendDirection": "上涨/下跌/横盘",
  "notes": "额外技术分析备注（50字以内）"
}`
        }
      ]
    }],
    max_tokens: 800,
    temperature: 0.2
  });

  trackUsage(response);

  const content = response.choices[0]?.message?.content || '{}';
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return { success: true, ...JSON.parse(jsonMatch[0]) }; } catch { /* fall through */ }
  }
  return { success: true, rawAnalysis: content };
}

/**
 * 市场分析生成
 */
async function generateMarketAnalysis(marketData) {
  const prompt = `你是一位资深A股市场分析师。请根据以下盘面数据，生成一份简洁的市场分析。

当前市场数据：
- 市场温度：${marketData.temperature}/100
- 上涨/下跌：${marketData.up}/${marketData.down} 家
- 成交额：${marketData.turnover} 亿
- 涨停/跌停：${marketData.limitUp}/${marketData.limitDown} 家
- 热点板块：${(marketData.sectors || []).slice(0,5).map(s => `${s.name}(${s.stage}, ${s.change > 0 ? '+' : ''}${s.change}%)`).join('、') || '暂无'}

请严格按照以下 JSON 格式返回（不要包含 markdown 代码块）：
{
  "summary": "当日市场综述，3-5句",
  "catalysts": [
    {"sector": "板块名", "catalyst": "催化逻辑描述", "impact": "高/中/低", "type": "政策/产业/资金/公告"}
  ],
  "riskNote": "当前主要风险提示（1-2句）"
}`;

  const content = await chat([{ role: 'user', content: prompt }], { maxTokens: 600 });

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return { success: true, ...JSON.parse(jsonMatch[0]) }; } catch { /* fall through */ }
  }
  return { success: true, summary: content };
}

/**
 * 财报解读
 */
async function analyzeFinancials(stockName, stockCode, financialData) {
  const prompt = `你是一位专业的财务分析师。请分析以下A股公司的财务数据。

公司：${stockName}（${stockCode}）
近4期归母净利润（亿元）：${(financialData.profitTrend || []).join(' → ') || '无数据'}
近4期营收（亿元）：${(financialData.revenueTrend || []).join(' → ') || '无数据'}

请严格按照以下 JSON 格式返回：
{
  "profitAssessment": "利润趋势评估（1-2句）",
  "revenueQuality": "营收质量判断",
  "cashflowNote": "现金流观察建议",
  "riskFlags": ["潜在风险1"],
  "verdict": "pass/warn/fail",
  "verdictText": "一句话总结，50字以内"
}`;

  const content = await chat([{ role: 'user', content: prompt }], { maxTokens: 500, temperature: 0.3 });

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return { success: true, ...JSON.parse(jsonMatch[0]) }; } catch { /* fall through */ }
  }
  return { success: true, verdictText: content };
}

function trackUsage(response) {
  const usage = response.usage;
  if (!usage) return;
  totalTokens += usage.total_tokens || 0;
  console.log(`[DeepSeek] ${usage.total_tokens} tokens, 累计 ${totalTokens}`);
}

function getUsageStats() {
  return { totalTokens };
}

module.exports = {
  analyzeChartPattern,
  generateMarketAnalysis,
  analyzeFinancials,
  getUsageStats
};
