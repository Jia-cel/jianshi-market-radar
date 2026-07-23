/**
 * POST /api/pattern/analyze
 * K 线形态 AI 识别
 * 接收前端上传的图片 base64，调用 OpenAI Vision 分析形态
 */

const express = require('express');
const { analyzeChartPattern } = require('../services/openai');
const { makeKey, getAiCache, setAiCache } = require('../services/ai-cache');

const router = express.Router();

// 每用户每天限制 20 次
const dailyLimits = new Map();

function checkLimit(ip) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${ip}:${today}`;
  const count = dailyLimits.get(key) || 0;
  if (count >= 20) return false;
  dailyLimits.set(key, count + 1);
  return true;
}

router.post('/analyze', async (req, res) => {
  const { imageBase64, imageType } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: '请提供 K 线图片' });
  }

  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!checkLimit(clientIp)) {
    return res.status(429).json({ error: '今日识别次数已用完（20次/天）' });
  }

  // 检查缓存
  const cacheKey = makeKey('pattern', imageBase64.slice(0, 200));
  const cached = getAiCache(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    const result = await analyzeChartPattern(imageBase64, imageType || 'image/png');
    if (result.success === false) {
      return res.status(500).json({ error: 'AI 识别失败: ' + (result.error || '未知错误') });
    }
    setAiCache(cacheKey, result, 60 * 60 * 1000);
    res.json({ ...result, cached: false });
  } catch (err) {
    const detail = err.message || String(err);
    console.error('[pattern] Error:', detail);
    let hint = '';
    if (detail.includes('401') || detail.includes('Incorrect API key')) hint = ' (API Key 无效)';
    else if (detail.includes('429') || detail.includes('quota')) hint = ' (配额不足)';
    else if (detail.includes('model')) hint = ' (模型不可用)';
    else if (detail.includes('timeout')) hint = ' (网络超时)';
    else if (detail.includes('image')) hint = ' (图片格式不兼容)';
    res.status(500).json({ error: 'AI 识别失败: ' + detail + hint });
  }
});

module.exports = router;
