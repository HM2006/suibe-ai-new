/**
 * 校园功能路由模块
 * 提供校园地图、课表、成绩、图书馆、新闻、服务等API接口
 * 使用模拟数据，后续可替换为真实数据源
 */

const express = require('express');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const {
  campusMap,
  schedule,
  WEEKDAYS,
  grades,
  library,
  news,
  services
} = require('../data/campus-data');
const newsCrawler = require('../services/news-crawler');

const router = express.Router();

// ==================== 校园地图 ====================

/**
 * GET /api/campus/map - 获取校园地图数据
 * 返回所有POI（兴趣点）信息，包括教学楼、图书馆、食堂等
 *
 * 查询参数:
 * - type: 按类型筛选（teaching/library/canteen/dormitory/sports/admin/service）
 *
 * 响应:
 * {
 *   success: true,
 *   data: { name, center, zoom, pois: [...] }
 * }
 */
router.get('/campus/map', asyncHandler(async (req, res) => {
  const { type } = req.query;

  let pois = campusMap.pois;

  // 按类型筛选
  if (type) {
    pois = pois.filter(poi => poi.type === type);
  }

  res.json({
    success: true,
    data: {
      name: campusMap.name,
      center: campusMap.center,
      zoom: campusMap.zoom,
      total: pois.length,
      pois: pois
    }
  });
}));

// ==================== 课表查询 ====================

/**
 * GET /api/campus/schedule - 按星期查询课表
 *
 * 查询参数:
 * - day: 星期几（1-7，1=周一，7=周日），默认返回全部
 *
 * 响应:
 * {
 *   success: true,
 *   data: { weekday, courses: [...] }
 * }
 */
router.get('/campus/schedule', asyncHandler(async (req, res) => {
  const { day } = req.query;

  if (day) {
    // 查询指定星期
    const dayNum = parseInt(day, 10);
    if (isNaN(dayNum) || dayNum < 1 || dayNum > 7) {
      throw new AppError('day参数必须为1-7之间的数字（1=周一，7=周日）', 400, 'INVALID_PARAMS');
    }

    const courses = schedule[day] || [];
    res.json({
      success: true,
      data: {
        weekday: WEEKDAYS[dayNum - 1],
        day: dayNum,
        courseCount: courses.length,
        courses: courses
      }
    });
  } else {
    // 返回全部课表
    const fullSchedule = {};
    for (let i = 1; i <= 7; i++) {
      fullSchedule[WEEKDAYS[i - 1]] = schedule[i] || [];
    }

    res.json({
      success: true,
      data: {
        schedule: fullSchedule,
        totalCourses: Object.values(schedule).flat().length
      }
    });
  }
}));

/**
 * GET /api/campus/schedule/today - 获取今日课表
 * 根据当前星期自动返回今天的课程安排
 *
 * 响应:
 * {
 *   success: true,
 *   data: { weekday, date, courses: [...] }
 * }
 */
router.get('/campus/schedule/today', asyncHandler(async (req, res) => {
  // 获取今天是星期几（1=周一，7=周日）
  const now = new Date();
  let dayOfWeek = now.getDay(); // 0=周日, 1=周一, ..., 6=周六
  // 转换为我们的格式（1=周一，7=周日）
  dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

  const courses = schedule[dayOfWeek] || [];

  res.json({
    success: true,
    data: {
      weekday: WEEKDAYS[dayOfWeek - 1],
      day: dayOfWeek,
      date: now.toISOString().split('T')[0],
      courseCount: courses.length,
      courses: courses,
      // 友好提示
      tip: courses.length === 0 ? '今天没有课程，好好休息吧！' : null
    }
  });
}));

// ==================== 成绩查询 ====================

/**
 * GET /api/campus/grades - 获取成绩信息
 *
 * 查询参数:
 * - semester: 按学期筛选（如 "2024-2025-1"）
 *
 * 响应:
 * {
 *   success: true,
 *   data: { student, gpa, totalCredits, ranking, courses: [...] }
 * }
 */
router.get('/campus/grades', asyncHandler(async (req, res) => {
  const { semester } = req.query;

  let courses = grades.courses;

  // 按学期筛选
  if (semester) {
    courses = courses.filter(c => c.semester === semester);
  }

  res.json({
    success: true,
    data: {
      student: grades.student,
      gpa: grades.gpa,
      totalCredits: grades.totalCredits,
      ranking: grades.ranking,
      currentSemester: grades.semester,
      courseCount: courses.length,
      courses: courses
    }
  });
}));

// ==================== 图书馆 ====================

/**
 * GET /api/campus/library - 获取图书馆借阅信息
 *
 * 查询参数:
 * - type: 信息类型（current=当前在借, history=历史记录, all=全部）
 *
 * 响应:
 * {
 *   success: true,
 *   data: { student, summary, currentBooks, history }
 * }
 */
router.get('/campus/library', asyncHandler(async (req, res) => {
  const { type } = req.query;

  const result = {
    student: library.student,
    summary: library.summary
  };

  // 根据type参数返回不同数据
  switch (type) {
    case 'current':
      result.currentBooks = library.currentBooks;
      break;
    case 'history':
      result.history = library.history;
      break;
    case 'all':
    default:
      result.currentBooks = library.currentBooks;
      result.history = library.history;
      break;
  }

  res.json({
    success: true,
    data: result
  });
}));

// ==================== 校园新闻 ====================

/**
 * GET /api/campus/news - 获取校园资讯列表
 *
 * 查询参数:
 * - category: 按分类筛选（就业/学术/通知/校园生活/合作/体育）
 * - limit: 返回数量限制（默认全部）
 * - page: 页码（默认1）
 *
 * 响应:
 * {
 *   success: true,
 *   data: { total, page, news: [...] }
 * }
 */
router.get('/campus/news', asyncHandler(async (req, res) => {
  const { category, limit, page = 1 } = req.query;

  try {
    // 尝试从实时爬虫获取数据
    let newsList = newsCrawler.getCachedNews();

    if (newsList.length === 0) {
      // 爬虫无缓存，主动抓取一次（学校要闻+教务处通知）
      console.log('[Campus/News] 缓存为空，主动抓取新闻...');
      try {
        const [schoolNews, jwcNews] = await Promise.allSettled([
          newsCrawler.fetchNewsList(1),
          newsCrawler.fetchJwcNoticeList(1),
        ]);
        if (schoolNews.status === 'fulfilled') newsCrawler.updateCache(schoolNews.value);
        if (jwcNews.status === 'fulfilled') newsCrawler.updateCache(jwcNews.value);
        newsList = newsCrawler.getCachedNews();
      } catch (err) {
        console.error('[Campus/News] 主动抓取失败:', err.message);
      }
    }

    // 按分类筛选
    if (category && category !== '全部') {
      newsList = newsList.filter(n => n.category === category);
    }

    // 按日期降序排列
    newsList.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = newsList.length;
    const pageSize = parseInt(limit, 10) || total || 10;
    const pageNum = parseInt(page, 10) || 1;

    // 分页
    const start = (pageNum - 1) * pageSize;
    const end = start + pageSize;
    const pagedNews = newsList.slice(start, end);

    res.json({
      success: true,
      data: {
        total: total,
        page: pageNum,
        pageSize: pageSize,
        totalPages: Math.ceil(total / pageSize),
        news: pagedNews,
        source: 'live' // 标记数据来源为实时爬虫
      }
    });
  } catch (error) {
    // 爬虫失败，fallback到模拟数据
    console.warn(`[Campus/News] 实时爬取失败，使用模拟数据: ${error.message}`);

    let newsList = [...news];

    // 按分类筛选
    if (category) {
      newsList = newsList.filter(n => n.category === category);
    }

    // 按日期降序排列
    newsList.sort((a, b) => new Date(b.date) - new Date(a.date));

    const total = newsList.length;
    const pageSize = parseInt(limit, 10) || total || 10;
    const pageNum = parseInt(page, 10) || 1;

    // 分页
    const start = (pageNum - 1) * pageSize;
    const end = start + pageSize;
    const pagedNews = newsList.slice(start, end);

    res.json({
      success: true,
      data: {
        total: total,
        page: pageNum,
        pageSize: pageSize,
        totalPages: Math.ceil(total / pageSize),
        news: pagedNews,
        source: 'mock' // 标记数据来源为模拟数据
      }
    });
  }
}));

/**
 * GET /api/campus/news/:id - 获取单条新闻详情
 *
 * 路径参数:
 * - id: 新闻ID
 */
router.get('/campus/news/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // 先从缓存中查找
  const cached = newsCrawler.getCachedNews().find(n => n.id === id);
  if (cached && cached.url) {
    try {
      const detail = await newsCrawler.fetchNewsDetail(cached.url);
      res.json({
        success: true,
        data: {
          ...cached,
          content: detail.content || cached.summary || '',
          author: detail.author || cached.author || '',
        }
      });
      return;
    } catch (err) {
      console.error('[Campus/News] 详情抓取失败，返回缓存数据:', err.message);
    }
  }

  // fallback: 从mock数据查找
  const newsItem = news.find(n => n.id === id);
  if (!newsItem) {
    throw new AppError('未找到该新闻', 404, 'NOT_FOUND');
  }

  res.json({
    success: true,
    data: newsItem
  });
}));

// ==================== 校园服务 ====================

/**
 * GET /api/campus/services - 获取校园服务信息
 *
 * 查询参数:
 * - category: 按分类筛选（教务/学习/生活/健康/就业/出行）
 * - status: 按状态筛选（online/maintenance）
 *
 * 响应:
 * {
 *   success: true,
 *   data: { services: [...] }
 * }
 */
router.get('/campus/services', asyncHandler(async (req, res) => {
  const { category, status } = req.query;

  let serviceList = [...services];

  // 按分类筛选
  if (category) {
    serviceList = serviceList.filter(s => s.category === category);
  }

  // 按状态筛选
  if (status) {
    serviceList = serviceList.filter(s => s.status === status);
  }

  res.json({
    success: true,
    data: {
      total: serviceList.length,
      services: serviceList
    }
  });
}));

module.exports = router;
