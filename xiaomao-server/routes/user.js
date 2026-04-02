/**
 * 用户路由模块
 *
 * 提供用户注册、登录、个人信息管理、修改密码等接口
 */

const express = require('express');
const router = express.Router();
const db = require('../services/database');
const { comparePassword, generateToken, authMiddleware } = require('../services/auth');
const { AppError } = require('../middleware/errorHandler');

// ==================== 注册 ====================

/**
 * POST /api/user/register - 用户注册
 * body: { username, password, nickname? }
 */
router.post('/user/register', (req, res) => {
  const { username, password, nickname } = req.body;

  // 验证必填字段
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空',
    });
  }

  // 验证用户名长度 3-20
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({
      success: false,
      message: '用户名长度需在3-20个字符之间',
    });
  }

  // 验证密码长度 6-20
  if (password.length < 6 || password.length > 20) {
    return res.status(400).json({
      success: false,
      message: '密码长度需在6-20个字符之间',
    });
  }

  // 检查用户名是否已存在
  const existingUser = db.getUserByUsername(username);
  if (existingUser) {
    return res.status(409).json({
      success: false,
      message: '用户名已存在',
    });
  }

  // 创建用户
  try {
    const newUser = db.createUser(username, password, nickname || '');
    const token = generateToken(newUser);

    console.log(`[User] 新用户注册成功: ${username} (ID: ${newUser.id})`);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          nickname: newUser.nickname,
          role: newUser.role,
        },
      },
    });
  } catch (error) {
    console.error('[User] 注册失败:', error.message);
    return res.status(500).json({
      success: false,
      message: '注册失败，请稍后重试',
    });
  }
});

// ==================== 登录 ====================

/**
 * POST /api/user/login - 用户登录
 * body: { username, password }
 */
router.post('/user/login', (req, res) => {
  const { username, password } = req.body;

  // 验证必填字段
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: '用户名和密码不能为空',
    });
  }

  // 查找用户
  const user = db.getUserByUsername(username);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: '用户名或密码错误',
    });
  }

  // 验证密码
  const isPasswordValid = comparePassword(password, user.password);
  if (!isPasswordValid) {
    return res.status(401).json({
      success: false,
      message: '用户名或密码错误',
    });
  }

  // 更新最后登录时间
  db.updateLastLogin(user.id);

  // 生成token
  const token = generateToken(user);

  console.log(`[User] 用户登录成功: ${username} (ID: ${user.id})`);

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
      },
    },
  });
});

// ==================== 获取个人信息 ====================

/**
 * GET /api/user/profile - 获取当前用户信息（需认证）
 */
router.get('/user/profile', authMiddleware, (req, res) => {
  const userId = req.user.userId;

  // 查询用户信息
  const user = db.getUserById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用户不存在',
    });
  }

  // 获取缓存的课表和成绩数据
  const scheduleCache = db.getScheduleCache(userId);
  const gradesCache = db.getGradesCache(userId);

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar || '',
        role: user.role,
        created_at: user.created_at,
        last_login: user.last_login,
        edu_connected: user.edu_connected,
      },
      scheduleCache: scheduleCache ? {
        data: scheduleCache.data,
        updated_at: scheduleCache.updated_at,
      } : null,
      gradesCache: gradesCache ? {
        data: gradesCache.data,
        gpa: gradesCache.gpa,
        total_credits: gradesCache.total_credits,
        updated_at: gradesCache.updated_at,
      } : null,
    },
  });
});

// ==================== 更新个人信息 ====================

/**
 * PUT /api/user/profile - 更新用户信息（需认证）
 * body: { nickname? }
 */
router.put('/user/profile', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const { nickname } = req.body;

  if (nickname !== undefined) {
    // 验证昵称长度
    if (nickname.length > 30) {
      return res.status(400).json({
        success: false,
        message: '昵称长度不能超过30个字符',
      });
    }
    db.updateUserNickname(userId, nickname);
  }

  // 返回更新后的用户信息
  const user = db.getUserById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用户不存在',
    });
  }

  res.json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        role: user.role,
      },
    },
  });
});

// ==================== 更新头像 ====================

/**
 * PUT /api/user/avatar - 更新用户头像（需认证）
 * body: { avatar } - emoji 字符串
 */
router.put('/user/avatar', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const { avatar } = req.body;

  if (!avatar || typeof avatar !== 'string' || avatar.length > 10) {
    return res.status(400).json({
      success: false,
      message: '头像格式无效',
    });
  }

  db.updateUserAvatar(userId, avatar);

  const user = db.getUserById(userId);
  res.json({
    success: true,
    data: {
      avatar: user.avatar,
    },
  });
});

// ==================== 修改密码 ====================

/**
 * POST /api/user/change-password - 修改密码（需认证）
 * body: { oldPassword, newPassword }
 */
router.post('/user/change-password', authMiddleware, (req, res) => {
  const userId = req.user.userId;
  const { oldPassword, newPassword } = req.body;

  // 验证必填字段
  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      message: '旧密码和新密码不能为空',
    });
  }

  // 验证新密码长度
  if (newPassword.length < 6 || newPassword.length > 20) {
    return res.status(400).json({
      success: false,
      message: '新密码长度需在6-20个字符之间',
    });
  }

  // 查找用户
  const user = db.getUserById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用户不存在',
    });
  }

  // 验证旧密码
  const isOldPasswordValid = comparePassword(oldPassword, user.password);
  if (!isOldPasswordValid) {
    return res.status(401).json({
      success: false,
      message: '旧密码错误',
    });
  }

  // 更新密码
  db.updateUserPassword(userId, newPassword);

  console.log(`[User] 用户 ${user.username} 修改密码成功`);

  res.json({
    success: true,
    message: '密码修改成功',
  });
});

module.exports = router;
