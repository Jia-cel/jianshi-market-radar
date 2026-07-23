const express = require('express');
const { getDb } = require('../db');
const { signToken, authRequired } = require('../middleware/auth');
const { generateCode, sendEmailCode, checkRateLimit } = require('../services/email');

const router = express.Router();

/**
 * POST /api/auth/send-code
 * 发送邮箱验证码
 */
router.post('/send-code', (req, res) => {
  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: '请输入正确的邮箱地址' });
  }

  // 频率检查
  const rateCheck = checkRateLimit(email);
  if (!rateCheck.allowed) {
    return res.status(429).json({
      error: `请${rateCheck.remaining}秒后再试`
    });
  }

  const code = generateCode();
  const db = getDb();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const ip = req.ip || req.socket?.remoteAddress || '';

  // 存储验证码
  db.prepare('INSERT INTO sms_codes (phone, code, ip, expires_at) VALUES (?, ?, ?, ?)').run(email, code, ip, expiresAt);

  // 发送邮件
  sendEmailCode(email, code).then(result => {
    if (!result.success && !result.devMode) {
      console.error(`Failed to send email to ${email}: ${result.error}`);
    }
  });

  res.json({ success: true, message: '验证码已发送到邮箱' });
});

/**
 * POST /api/auth/verify
 * 验证码校验 + 登录/注册
 */
router.post('/verify', (req, res) => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: '邮箱和验证码不能为空' });
  }

  const db = getDb();

  // 检查验证码
  const record = db.prepare(
    `SELECT * FROM sms_codes
     WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
     ORDER BY id DESC LIMIT 1`
  ).get(email, code);

  if (!record) {
    return res.status(400).json({ error: '验证码错误或已过期' });
  }

  // 标记验证码已使用
  db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(record.id);

  // 查找或创建用户（phone 字段复用为 email 标识）
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(email);
  if (!user) {
    const result = db.prepare('INSERT INTO users (phone) VALUES (?)').run(email);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    // 创建默认设置
    db.prepare('INSERT INTO user_settings (user_id) VALUES (?)').run(user.id);
  } else {
    db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  }

  const token = signToken(user);
  // 邮箱前缀作为默认昵称
  const nickname = email.split('@')[0];

  res.json({
    success: true,
    token,
    expiresIn: 604800,
    user: {
      id: user.id,
      phone: user.phone,    // 实际上是 email
      nickname: user.nickname || nickname,
      avatar: user.avatar
    }
  });
});

/**
 * POST /api/auth/refresh
 */
router.post('/refresh', authRequired, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }
  const token = signToken(user);
  res.json({ success: true, token, expiresIn: 604800 });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authRequired, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, phone, nickname, avatar, created_at, last_login_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const settings = db.prepare('SELECT settings_json FROM user_settings WHERE user_id = ?').get(user.id);
  user.settings = settings ? JSON.parse(settings.settings_json) : {};

  res.json({ user });
});

/**
 * PUT /api/auth/me/settings
 */
router.put('/me/settings', authRequired, (req, res) => {
  const db = getDb();
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'settings must be an object' });
  }
  const json = JSON.stringify(settings);
  db.prepare(
    `INSERT INTO user_settings (user_id, settings_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET settings_json = ?, updated_at = datetime('now')`
  ).run(req.user.id, json, json);
  res.json({ success: true });
});

module.exports = router;
