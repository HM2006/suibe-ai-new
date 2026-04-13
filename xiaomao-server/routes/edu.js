/**
 * 教务系统集成路由模块（纯 HTTP 版）
 *
 * 修改内容：
 * 1. 完全移除 Puppeteer/浏览器相关逻辑
 * 2. 二维码获取直接通过 HTTP 请求，无需浏览器初始化
 * 3. sync 端点课表和成绩可并行获取
 * 4. 添加会话验证端点
 */

const express = require('express');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const EduProxy = require('../services/edu-proxy');

const router = express.Router();

function getEduProxy() {
  return EduProxy.getInstance();
}

// ==================== 诊断端点 ====================

/**
 * GET /api/edu/status - 获取教务系统代理状态
 */
router.get('/edu/status', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  res.json({
    success: true,
    data: {
      loggedIn: eduProxy.loggedIn,
      cookieCount: Object.keys(eduProxy.cookieJar || {}).length,
      studentId: eduProxy.studentId,
      semesterId: eduProxy.semesterId,
      qrUuid: eduProxy.qrUuid,
      apiMode: !!eduProxy.axiosInstance,
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * GET /api/edu/session/validate - 验证会话是否仍然有效
 */
router.get('/edu/session/validate', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  const valid = await eduProxy.validateSession();
  res.json({
    success: true,
    data: { valid }
  });
}));

// ==================== 登录相关 ====================

/**
 * GET /api/edu/login/qr - 获取登录二维码（纯 HTTP，无需浏览器）
 */
router.get('/edu/login/qr', asyncHandler(async (req, res) => {
  console.log('[EduRoute] 收到获取二维码请求');
  const startTime = Date.now();

  let eduProxy = getEduProxy();

  // 如果已登录，先重置
  if (eduProxy.loggedIn) {
    console.log('[EduRoute] 已有登录状态，先重置...');
    EduProxy.resetInstance();
    eduProxy = getEduProxy();
  }

  try {
    const result = await eduProxy.getLoginQRCode();
    const elapsed = Date.now() - startTime;
    console.log(`[EduRoute] 二维码获取成功，耗时: ${elapsed}ms`);

    res.json({
      success: true,
      data: {
        qrCodeImage: result.qrCodeImage,
        loginUrl: result.loginUrl
      }
    });
  } catch (qrError) {
    const elapsed = Date.now() - startTime;
    console.error(`[EduRoute] 二维码获取失败，耗时: ${elapsed}ms`);
    console.error('[EduRoute] 错误详情:', qrError.message);

    // 尝试重置并重试一次
    console.log('[EduRoute] 尝试重置并重试...');
    try {
      EduProxy.resetInstance();
      const retryProxy = getEduProxy();
      const result = await retryProxy.getLoginQRCode();
      console.log('[EduRoute] 重试成功！');
      res.json({
        success: true,
        data: {
          qrCodeImage: result.qrCodeImage,
          loginUrl: result.loginUrl
        }
      });
    } catch (retryError) {
      console.error('[EduRoute] 重试也失败了:', retryError.message);
      throw new AppError(
        `获取二维码失败: ${retryError.message}`,
        500, 'QR_FETCH_FAILED'
      );
    }
  }
}));

/**
 * POST /api/edu/login/check - 检查登录状态
 */
router.post('/edu/login/check', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  const { timeout = 5000 } = req.body;

  const alreadyLoggedIn = await eduProxy.checkLoginStatus();

  if (alreadyLoggedIn) {
    res.json({
      success: true,
      data: {
        loggedIn: true,
        message: '已登录教务系统'
      }
    });
    return;
  }

  const result = await eduProxy.waitForLogin(parseInt(timeout, 10));

  if (result.success) {
    res.json({
      success: true,
      data: {
        loggedIn: true,
        message: '登录成功',
        cookies: result.cookies
      }
    });
  } else {
    res.json({
      success: true,
      data: {
        loggedIn: false,
        message: result.message || '等待登录中...'
      }
    });
  }
}));

// ==================== 课表查询 ====================

router.get('/edu/schedule', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  const loggedIn = await eduProxy.checkLoginStatus();
  if (!loggedIn) {
    throw new AppError('未登录教务系统，请先完成扫码登录', 401, 'NOT_LOGGED_IN');
  }
  const scheduleData = await eduProxy.getSchedule();

  const { userId } = req.query;
  if (userId) {
    try {
      const db = require('../services/database');
      db.saveScheduleCache(parseInt(userId), scheduleData);
      db.updateEduConnected(parseInt(userId), 1);
      console.log(`[EduRoute] 课表数据已缓存到用户 ${userId}，已更新连接状态`);
    } catch (cacheErr) {
      console.warn('[EduRoute] 缓存课表数据失败:', cacheErr.message);
    }
  }

  res.json({ success: true, data: scheduleData });
}));

// ==================== MOOC课程查询 ====================

router.get('/edu/mooc', asyncHandler(async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    throw new AppError('缺少userId参数', 400);
  }

  const db = require('../services/database');
  const cache = db.getScheduleCache(parseInt(userId));

  if (cache && cache.data && cache.data.moocCourses) {
    return res.json({ success: true, data: cache.data.moocCourses, fromCache: true });
  }

  res.json({ success: true, data: [], fromCache: false });
}));

// ==================== 成绩查询 ====================

router.get('/edu/grades', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  const loggedIn = await eduProxy.checkLoginStatus();
  if (!loggedIn) {
    throw new AppError('未登录教务系统，请先完成扫码登录', 401, 'NOT_LOGGED_IN');
  }
  const gradesData = await eduProxy.getGrades();
  const { semester } = req.query;
  if (semester && gradesData.grades) {
    gradesData.grades = gradesData.grades.filter(g => g.semester === semester);
    gradesData.courseCount = gradesData.grades.length;
  }

  const { userId } = req.query;
  if (userId) {
    try {
      const db = require('../services/database');
      db.saveGradesCache(parseInt(userId), gradesData, gradesData.gpa, gradesData.totalCredits);
      db.updateEduConnected(parseInt(userId), 1);
      console.log(`[EduRoute] 成绩数据已缓存到用户 ${userId}，已更新连接状态`);
    } catch (cacheErr) {
      console.warn('[EduRoute] 缓存成绩数据失败:', cacheErr.message);
    }
  }

  res.json({ success: true, data: gradesData });
}));

// ==================== 合并同步 ====================

/**
 * GET /api/edu/sync - 一次请求获取课表和成绩并缓存
 * 纯 HTTP 版本：课表和成绩可以并行获取
 */
router.get('/edu/sync', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();

  if (!eduProxy.loggedIn) {
    throw new AppError('未登录教务系统，请先完成扫码登录', 401, 'NOT_LOGGED_IN');
  }

  const { userId, semester } = req.query;

  const [scheduleData, gradesData] = await Promise.all([
    eduProxy.getSchedule(),
    eduProxy.getGrades(),
  ]);

  if (semester && gradesData.grades) {
    gradesData.grades = gradesData.grades.filter(g => g.semester === semester);
    gradesData.courseCount = gradesData.grades.length;
  }

  if (userId) {
    try {
      const db = require('../services/database');
      db.saveScheduleCache(parseInt(userId), scheduleData);
      db.saveGradesCache(parseInt(userId), gradesData, gradesData.gpa, gradesData.totalCredits);
      db.updateEduConnected(parseInt(userId), 1);
      console.log(`[EduRoute] 同步数据已缓存到用户 ${userId}，已更新连接状态`);
    } catch (cacheErr) {
      console.warn('[EduRoute] 缓存同步数据失败:', cacheErr.message);
    }
  }

  res.json({
    success: true,
    data: {
      schedule: scheduleData,
      grades: gradesData
    }
  });
}));

// ==================== 登出 ====================

router.post('/edu/logout', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  eduProxy.close();
  EduProxy.resetInstance();

  const { userId } = req.query;
  if (userId) {
    try {
      const db = require('../services/database');
      db.updateEduConnected(parseInt(userId), 0);
      console.log(`[EduRoute] 已断开用户 ${userId} 的教务系统连接`);
    } catch (err) {
      console.warn('[EduRoute] 更新连接状态失败:', err.message);
    }
  }

  res.json({ success: true, message: '已登出教务系统' });
}));

module.exports = router;
