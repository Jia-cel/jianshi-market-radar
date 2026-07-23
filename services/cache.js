/**
 * 双层缓存层：内存 + SQLite
 * - 内存缓存：毫秒级读取，用于页面渲染
 * - SQLite 持久化：服务重启后恢复，避免重复调用 Tushare
 */

const { getDb } = require('../db');

// 内存缓存
const memoryCache = new Map();

/**
 * 从缓存获取数据
 */
function getCache(key) {
  // 先查内存
  if (memoryCache.has(key)) {
    const entry = memoryCache.get(key);
    if (Date.now() < entry.expiresAt) {
      return entry.value;
    }
    memoryCache.delete(key);
  }

  // 再查 SQLite
  const db = getDb();
  const row = db.prepare(
    `SELECT cache_value FROM market_cache WHERE cache_key = ? AND expires_at > datetime('now')`
  ).get(key);

  if (row) {
    const value = JSON.parse(row.cache_value);
    memoryCache.set(key, { value, expiresAt: Date.now() + 60000 }); // 内存缓存 1 分钟
    return value;
  }

  return null;
}

/**
 * 写入缓存
 */
function setCache(key, value, ttlSeconds = 300) {
  // 写内存
  memoryCache.set(key, {
    value,
    expiresAt: Date.now() + Math.min(ttlSeconds * 1000, 60000) // 内存最多存 1 分钟
  });

  // 写 SQLite
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  const json = JSON.stringify(value);

  db.prepare(
    `INSERT OR REPLACE INTO market_cache (cache_key, cache_value, expires_at)
     VALUES (?, ?, ?)`
  ).run(key, json, expiresAt);
}

/**
 * 清除过期缓存
 */
function cleanExpiredCache() {
  const db = getDb();
  db.prepare(`DELETE FROM market_cache WHERE expires_at < datetime('now')`).run();
}

/**
 * 获取缓存统计
 */
function getCacheStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM market_cache').get();
  const memory = memoryCache.size;
  return { memoryEntries: memory, dbEntries: total?.count || 0 };
}

// 每 5 分钟清理一次过期缓存
setInterval(cleanExpiredCache, 5 * 60 * 1000);

module.exports = { getCache, setCache, cleanExpiredCache, getCacheStats };
