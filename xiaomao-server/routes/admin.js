/**
 * 管理后台路由模块
 *
 * 所有端点都需要认证且 role 为 admin
 * 提供用户管理、统计信息等功能
 */

const express = require('express');
const router = express.Router();
const db = require('../services/database');
const { authMiddleware, adminMiddleware } = require('../services/auth');

// 所有管理路由都需要认证 + 管理员权限
router.use(authMiddleware, adminMiddleware);

// ==================== 获取所有用户列表 ====================

/**
 * GET /api/admin/users - 获取所有用户列表
 * 返回用户列表（不含密码）
 */
router.get('/admin/users', (req, res) => {
  const users = db.getAllUsers();

  res.json({
    success: true,
    data: {
      total: users.length,
      users,
    },
  });
});

// ==================== 获取用户详细统计 ====================

/**
 * GET /api/admin/users/:id/stats - 获取用户详细统计
 * 返回用户的课表和成绩缓存数据
 */
router.get('/admin/users/:id/stats', (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: '无效的用户ID',
    });
  }

  const stats = db.getUserStats(userId);
  if (!stats) {
    return res.status(404).json({
      success: false,
      message: '用户不存在',
    });
  }

  res.json({
    success: true,
    data: stats,
  });
});

// ==================== 删除用户 ====================

/**
 * DELETE /api/admin/users/:id - 删除用户
 */
router.delete('/admin/users/:id', (req, res) => {
  const userId = parseInt(req.params.id, 10);

  if (isNaN(userId)) {
    return res.status(400).json({
      success: false,
      message: '无效的用户ID',
    });
  }

  // 不允许删除自己
  if (userId === req.user.userId) {
    return res.status(400).json({
      success: false,
      message: '不能删除自己的账号',
    });
  }

  const deleted = db.deleteUser(userId);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: '用户不存在',
    });
  }

  console.log(`[Admin] 管理员 ${req.user.username} 删除了用户 ID: ${userId}`);

  res.json({
    success: true,
    message: '用户已删除',
  });
});

// ==================== 对话记录管理 ====================

/**
 * GET /api/admin/chat-records - 获取所有对话记录
 */
router.get('/admin/chat-records', (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = parseInt(req.query.pageSize, 10) || 20;
  const userId = req.query.userId ? parseInt(req.query.userId, 10) : null;

  const result = db.getAllChatRecords({ page, pageSize, userId });

  res.json({
    success: true,
    data: result,
  });
});

/**
 * DELETE /api/admin/chat-records/:id - 删除对话记录
 */
router.delete('/admin/chat-records/:id', (req, res) => {
  const recordId = parseInt(req.params.id, 10);

  if (isNaN(recordId)) {
    return res.status(400).json({
      success: false,
      message: '无效的记录ID',
    });
  }

  const deleted = db.deleteChatRecord(recordId);
  if (!deleted) {
    return res.status(404).json({
      success: false,
      message: '记录不存在',
    });
  }

  res.json({
    success: true,
    message: '记录已删除',
  });
});

module.exports = router;
