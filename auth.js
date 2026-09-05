const crypto = require('crypto');

// 用内置 scrypt 做密码哈希，避免引入原生依赖
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, derived] = stored.split('$');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  // 定长比较，防时序攻击
  const a = Buffer.from(check, 'hex');
  const b = Buffer.from(derived, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 登录校验：返回 { ok, admin, reason }
function authenticate(username, password) {
  const db = require('./db');
  const admin = db.getAdmin();
  if (!admin) return { ok: false, reason: 'no-admin' };
  if (admin.username !== username) return { ok: false, reason: 'bad-credentials' };
  if (!verifyPassword(password, admin.passwordHash)) return { ok: false, reason: 'bad-credentials' };
  return { ok: true, admin };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: '未登录' });
  return res.redirect('/admin/login');
}

module.exports = { hashPassword, verifyPassword, authenticate, requireAuth };
