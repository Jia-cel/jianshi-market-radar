const { getDb } = require('./index');

function initSchema() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      nickname TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      last_login_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sms_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      code TEXT NOT NULL,
      ip TEXT DEFAULT '',
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_codes(phone, expires_at);

    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      settings_json TEXT DEFAULT '{}',
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- 行情缓存表（目标二会用到）
    CREATE TABLE IF NOT EXISTS market_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cache_key TEXT NOT NULL UNIQUE,
      cache_value TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_cache_key ON market_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_cache_expires ON market_cache(expires_at);
  `);

  console.log('Database schema initialized');
}

module.exports = { initSchema };
