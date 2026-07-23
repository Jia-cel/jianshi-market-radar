const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'jianshi-radar-jwt-secret';
const TOKEN_EXPIRY = '7d';

/**
 * 签发 JWT
 */
function signToken(user) {
  return jwt.sign(
    { id: user.id, phone: user.phone },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

/**
 * JWT 验证中间件
 * 可选鉴权：如果没带 token 也能继续（作为游客），req.user 为 null
 */
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/**
 * 可选鉴权中间件：有 token 就解析，没有也能继续
 */
function authOptional(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

module.exports = { signToken, authRequired, authOptional, JWT_SECRET };
