/**
 * AI 结果缓存层
 * 按 prompt hash + 输入数据 hash 做缓存，避免重复调用 OpenAI
 */

const crypto = require('crypto');

// 内存缓存: key -> { value, expiresAt }
const cache = new Map();
const DEFAULT_TTL = 60 * 60 * 1000; // 1 小时

/**
 * 生成缓存 key
 */
function makeKey(prefix, input) {
  const hash = crypto.createHash('md5').update(JSON.stringify(input)).digest('hex').slice(0, 16);
  return `ai:${prefix}:${hash}`;
}

/**
 * 获取缓存
 */
function getAiCache(key) {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.value;
  }
  if (entry) cache.delete(key);
  return null;
}

/**
 * 写入缓存
 */
function setAiCache(key, value, ttl = DEFAULT_TTL) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl
  });
}

/**
 * 清理过期缓存
 */
function cleanAiCache() {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt) cache.delete(key);
  }
}

// 每 30 分钟清理一次
setInterval(cleanAiCache, 30 * 60 * 1000);

module.exports = { makeKey, getAiCache, setAiCache };
