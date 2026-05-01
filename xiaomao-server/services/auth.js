/**
 * 认证服务模块
 *
 * 提供 JWT 认证、密码加密、认证中间件等功能
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// JWT密钥
const JWT_SECRET = process.env.JWT_SECRET || 'xiaomao-secret-key-2026';
// JWT有效期：7天
const JWT_EXPIRES_IN = '7d';

/**
 * 密码hash
 * @param {string} password - 明文密码
 * @returns {string} hash后的密码
 */
function hashPassword(password) {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(password, salt);
}

/**
 * 密码比对
 * @param {string} password - 明文密码
 * @param {string} hash - hash后的密码
 * @returns {boolean} 是否匹配
 */
function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

/**
 * 生成JWT token
 * @param {object} user - 用户对象（需包含 id, username, role）
 * @returns {string} JWT token
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * 验证JWT token
 * @param {string} token - JWT token
 * @returns {object|null} 解码后的用户信息，验证失败返回null
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.warn('[Auth] Token验证失败:', error.message);
    return null;
  }
}

/**
 * Express认证中间件
 * 从 Authorization header 提取 Bearer token 并验证
 * 验证成功后将用户信息挂到 req.user 上
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌，请先登录',
    });
  }

  const token = authHeader.substring(7); // 去掉 "Bearer " 前缀
  const user = verifyToken(token);

  if (!user) {
    return res.status(401).json({
      success: false,
      message: '认证令牌无效或已过期，请重新登录',
    });
  }

  // 将用户信息挂到 req 上
  req.user = user;
  next();
}

/**
 * 管理员权限中间件
 * 需要在 authMiddleware 之后使用
 * 验证当前用户是否为管理员
 */
function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: '权限不足，需要管理员权限',
    });
  }
  next();
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authMiddleware,
  adminMiddleware,
};
