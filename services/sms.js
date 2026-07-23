const crypto = require('crypto');

/**
 * 腾讯云短信服务
 *
 * 前置条件（需在腾讯云控制台操作）：
 * 1. 开通短信服务：https://console.cloud.tencent.com/smsv2
 * 2. 创建应用 → 获取 SDK AppID
 * 3. 申请签名（个人可用小程序/公众号名称）
 * 4. 申请正文模板（如"您的验证码是{1}"）
 * 5. 获取 API 密钥：https://console.cloud.tencent.com/cam/capi
 *
 * 开发模式（SMS_DEV_MODE=true）：验证码打印到控制台，不发送真实短信
 */

const DEV_MODE = process.env.SMS_DEV_MODE === 'true';

const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const SMS_APP_ID = process.env.TENCENT_SMS_APP_ID || '';
const SIGN_NAME = process.env.TENCENT_SMS_SIGN || '见势';
const TEMPLATE_ID = process.env.TENCENT_SMS_TEMPLATE || '';

const ENDPOINT = 'sms.tencentcloudapi.com';
const API_VERSION = '2021-01-11';

/**
 * 生成 6 位数字验证码
 */
function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 腾讯云 API v3 签名 (TC3-HMAC-SHA256)
 */
function sha256(data, key = '') {
  if (key) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }
  return crypto.createHash('sha256').update(data).digest();
}

function tencentSign(action, payload, timestamp) {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  // 1. Canonical Request
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${ENDPOINT}\n`;
  const signedHeaders = 'content-type;host';
  const hashedPayload = sha256(payload).toString('hex');

  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedPayload
  ].join('\n');

  // 2. String to Sign
  const algorithm = 'TC3-HMAC-SHA256';
  const service = 'sms';
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256(canonicalRequest).toString('hex');

  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n');

  // 3. Signature
  const secretDate = sha256(date, `TC3${SECRET_KEY}`);
  const secretService = sha256(service, secretDate);
  const secretSigning = sha256('tc3_request', secretService);
  const signature = sha256(stringToSign, secretSigning).toString('hex');

  // 4. Authorization
  return `${algorithm} Credential=${SECRET_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

/**
 * 发送短信验证码
 */
async function sendSms(phone, code) {
  if (DEV_MODE) {
    console.log(`\n📱 [DEV MODE] 验证码发送到 ${phone}: ${code}\n`);
    return { success: true, devMode: true };
  }

  // 手机号要加 +86 前缀
  const phoneWithCode = phone.startsWith('+') ? phone : `+86${phone}`;

  const payload = JSON.stringify({
    PhoneNumberSet: [phoneWithCode],
    SmsSdkAppId: SMS_APP_ID,
    SignName: SIGN_NAME,
    TemplateId: TEMPLATE_ID,
    TemplateParamSet: [code]
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const authorization = tencentSign('SendSms', payload, timestamp);

  try {
    const response = await fetch(`https://${ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Host': ENDPOINT,
        'X-TC-Action': 'SendSms',
        'X-TC-Version': API_VERSION,
        'X-TC-Timestamp': String(timestamp),
        'X-TC-Region': 'ap-guangzhou',
        'Authorization': authorization
      },
      body: payload
    });

    const result = await response.json();

    if (result.Response?.Error) {
      console.error('Tencent SMS failed:', result.Response.Error);
      return { success: false, error: result.Response.Error.Message || '发送失败' };
    }

    // SendStatusSet[0].Code === 'Ok' 表示成功
    const status = result.Response?.SendStatusSet?.[0];
    if (status?.Code === 'Ok') {
      return { success: true };
    }

    console.error('Tencent SMS status:', status);
    return { success: false, error: status?.Message || '发送失败' };
  } catch (err) {
    console.error('Tencent SMS request error:', err.message);
    return { success: false, error: '短信服务暂不可用' };
  }
}

/**
 * 频率检查：同一手机号 60 秒内不能重复发
 */
const lastSendTime = new Map();

function checkRateLimit(phone) {
  const last = lastSendTime.get(phone);
  if (last && Date.now() - last < 60000) {
    const remaining = Math.ceil((60000 - (Date.now() - last)) / 1000);
    return { allowed: false, remaining };
  }
  lastSendTime.set(phone, Date.now());
  return { allowed: true, remaining: 0 };
}

module.exports = { generateCode, sendSms, checkRateLimit, DEV_MODE };
