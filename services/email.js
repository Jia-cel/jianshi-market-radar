const nodemailer = require('nodemailer');

/**
 * 邮箱验证码服务 — 支持 QQ / 163 / 126 / Gmail
 *
 * ════════════════════════════════════════════════════
 *  推荐 163 邮箱（最省事）：
 *    1. https://mail.163.com → 设置 → POP3/SMTP/IMAP
 *    2. 开启「SMTP 服务」→ 点一下「新增授权码」
 *    3. 发一条短信验证 → 拿到 16 位授权码 → 完事
 *
 *  QQ 邮箱：
 *    类似流程，入口在 设置 → 账户 → POP3/SMTP 服务
 *
 *  开发模式（EMAIL_DEV_MODE=true）：验证码打印到控制台
 * ════════════════════════════════════════════════════
 */

const DEV_MODE = process.env.EMAIL_DEV_MODE === 'true';

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_AUTH_CODE = process.env.EMAIL_AUTH_CODE || '';

// 常见邮箱 SMTP 配置
const SMTP_CONFIGS = {
  'qq.com':    { host: 'smtp.qq.com',   port: 465 },
  '163.com':   { host: 'smtp.163.com',  port: 465 },
  '126.com':   { host: 'smtp.126.com',  port: 465 },
  'gmail.com': { host: 'smtp.gmail.com', port: 465 },
  'outlook.com': { host: 'smtp-mail.outlook.com', port: 587 }
};

let transporter = null;

function getTransporter() {
  if (!transporter) {
    // 从邮箱地址自动识别服务商
    const domain = EMAIL_USER.split('@')[1] || '';
    const config = SMTP_CONFIGS[domain] || SMTP_CONFIGS['qq.com'];

    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_AUTH_CODE
      }
    });
  }
  return transporter;
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendEmailCode(toEmail, code) {
  if (DEV_MODE) {
    console.log(`\n📧 [DEV MODE] 验证码发送到 ${toEmail}: ${code}\n`);
    return { success: true, devMode: true };
  }

  try {
    const mailer = getTransporter();
    await mailer.sendMail({
      from: `"见势A股雷达" <${EMAIL_USER}>`,
      to: toEmail,
      subject: '见势 - 登录验证码',
      html: `
        <div style="max-width:420px;margin:30px auto;padding:28px;font-family:'PingFang SC','Microsoft YaHei',sans-serif;background:#0d1725;border-radius:14px;color:#edf4ff;border:1px solid rgba(148,163,184,.12);">
          <div style="font-size:20px;font-weight:700;margin-bottom:20px;">见势 <span style="color:#8090a6;font-size:12px;">A股热点雷达</span></div>
          <div style="font-size:28px;font-weight:700;letter-spacing:6px;color:#25d4c4;margin:18px 0;">${code}</div>
          <p style="color:#8090a6;font-size:12px;">验证码 5 分钟内有效，请勿泄露给他人。</p>
          <div style="margin-top:24px;padding-top:16px;border-top:1px solid rgba(148,163,184,.1);color:#56657a;font-size:11px;">如果不是你本人操作，请忽略此邮件。</div>
        </div>
      `
    });
    return { success: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { success: false, error: '邮件发送失败' };
  }
}

const lastSendTime = new Map();

function checkRateLimit(email) {
  const last = lastSendTime.get(email);
  if (last && Date.now() - last < 60000) {
    const remaining = Math.ceil((60000 - (Date.now() - last)) / 1000);
    return { allowed: false, remaining };
  }
  lastSendTime.set(email, Date.now());
  return { allowed: true, remaining: 0 };
}

module.exports = { generateCode, sendEmailCode, checkRateLimit, DEV_MODE };
