/**
 * 教务系统集成路由模块（修复版）
 *
 * 修复内容：
 * 1. 增加详细的错误日志
 * 2. 增加诊断端点
 * 3. 优化错误响应格式
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
 * 用于诊断浏览器和登录状态
 */
router.get('/edu/status', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  res.json({
    success: true,
    data: {
      initialized: eduProxy.initialized,
      loggedIn: eduProxy.loggedIn,
      currentUrl: eduProxy.currentUrl,
      cookieCount: eduProxy.cookies.length,
      timestamp: new Date().toISOString()
    }
  });
}));

/**
 * GET /api/edu/debug/screenshot - 获取当前页面截图（调试用）
 */
router.get('/edu/debug/screenshot', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  if (!eduProxy.page) {
    throw new AppError('浏览器未初始化', 400);
  }
  const screenshot = await eduProxy.page.screenshot({
    type: 'png',
    fullPage: true,
    encoding: 'base64'
  });
  const currentUrl = eduProxy.page.url();
  res.json({
    success: true,
    data: {
      screenshot,
      currentUrl,
      timestamp: new Date().toISOString()
    }
  });
}));

// ==================== 登录相关 ====================

/**
 * GET /api/edu/login/qr - 获取登录二维码
 */
router.get('/edu/login/qr', asyncHandler(async (req, res) => {
  console.log('[EduRoute] 收到获取二维码请求');
  const startTime = Date.now();

  const eduProxy = getEduProxy();

  // 如果之前已经初始化但失败了，先重置
  if (eduProxy.initialized && !eduProxy.browser) {
    console.log('[EduRoute] 浏览器状态异常，重置实例...');
    EduProxy.resetInstance();
  }

  const freshProxy = getEduProxy();

  // 确保浏览器已初始化
  try {
    await freshProxy.ensureInitialized();
  } catch (initError) {
    console.error('[EduRoute] 浏览器初始化失败:', initError.message);
    throw new AppError(
      `浏览器初始化失败: ${initError.message}。请确保服务器已安装Chrome/Chromium。`,
      500, 'BROWSER_INIT_FAILED'
    );
  }

  // 获取登录二维码
  try {
    const result = await freshProxy.getLoginQRCode();
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
    console.log('[EduRoute] 尝试重置浏览器并重试...');
    try {
      EduProxy.resetInstance();
      const retryProxy = getEduProxy();
      await retryProxy.ensureInitialized();
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

  // 如果请求带有userId（通过query参数），保存到缓存并更新连接状态
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

  // 如果请求带有userId（通过query参数），保存到缓存并更新连接状态
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
 * GET /api/edu/sync - 一次请求同时获取课表和成绩并缓存
 */
router.get('/edu/sync', asyncHandler(async (req, res) => {
  const eduProxy = getEduProxy();
  const loggedIn = await eduProxy.checkLoginStatus();
  if (!loggedIn) {
    throw new AppError('未登录教务系统，请先完成扫码登录', 401, 'NOT_LOGGED_IN');
  }

  const { userId, semester } = req.query;

  // 并行获取课表和成绩
  const [scheduleData, gradesData] = await Promise.all([
    eduProxy.getSchedule(),
    eduProxy.getGrades()
  ]);

  // 按学期筛选成绩
  if (semester && gradesData.grades) {
    gradesData.grades = gradesData.grades.filter(g => g.semester === semester);
    gradesData.courseCount = gradesData.grades.length;
  }

  // 缓存数据
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
  await eduProxy.close();
  EduProxy.resetInstance();

  // 如果带有userId，更新数据库中的连接状态
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
