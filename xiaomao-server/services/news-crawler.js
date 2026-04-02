/**
 * 新闻爬虫服务模块
 * 负责从上海对外经贸大学官网抓取"学校要闻"栏目新闻
 *
 * 数据源：https://news.suibe.edu.cn/12512/list.htm
 * 使用 undici + cheerio 实现 HTML 抓取和解析
 * 支持定时抓取、内存缓存、增量更新
 */

const { ProxyAgent, fetch: undiciFetch } = require('undici');
const cheerio = require('cheerio');

// ==================== 配置常量 ====================

const BASE_URL = 'https://news.suibe.edu.cn';
const LIST_URL_TEMPLATE = 'https://news.suibe.edu.cn/12512/list.htm'; // 第一页
const LIST_PAGE_URL_TEMPLATE = 'https://news.suibe.edu.cn/12512/list{pageNum}.htm'; // 后续页
const CATEGORY = '学校要闻';
const JWC_BASE_URL = 'https://jwc.suibe.edu.cn';
const JWC_LIST_URL = 'https://jwc.suibe.edu.cn/tzggwxszl/list.htm';
const JWC_LIST_PAGE_URL = 'https://jwc.suibe.edu.cn/tzggwxszl/list{pageNum}.htm';
const JWC_CATEGORY = '教务通知';
const MAX_CACHE_SIZE = 100; // 缓存最多保留的新闻条数
const CRON_INTERVAL = 30 * 60 * 1000; // 定时抓取间隔：30分钟
const REQUEST_TIMEOUT = 10000; // 请求超时：10秒

// 代理配置（自动检测环境变量）
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
const dispatcher = PROXY_URL ? new ProxyAgent(PROXY_URL) : undefined;

// 请求头配置
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Connection': 'keep-alive',
  'Referer': 'https://news.suibe.edu.cn/',
};

// ==================== 内存缓存 ====================

/** 新闻缓存数组，按抓取时间倒序排列 */
let newsCache = [];

/** 已知新闻URL集合，用于去重 */
let knownUrls = new Set();

/** 定时任务句柄 */
let cronTimer = null;

/** 自增ID计数器 */
let idCounter = 0;

// ==================== 工具函数 ====================

/**
 * 生成新闻唯一ID
 * @param {string} url - 新闻URL
 * @returns {string} 唯一ID
 */
function generateId(url) {
  idCounter++;
  return `news_live_${String(idCounter).padStart(4, '0')}`;
}

/**
 * 将相对URL转换为绝对URL
 * @param {string} url - 可能是相对路径或绝对路径的URL
 * @returns {string} 绝对URL
 */
function resolveUrl(url) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // 处理相对路径，如 /2026/0326/c12512a193736/page.htm
  if (url.startsWith('/')) {
    return BASE_URL + url;
  }
  return BASE_URL + '/' + url;
}

/**
 * 解析日期字符串，将 "03-27" 和 "2026" 组合为标准日期格式
 * @param {string} monthDay - 月-日，如 "03-27"
 * @param {string} year - 年份，如 "2026"
 * @returns {string} ISO格式日期字符串，如 "2026-03-27"
 */
function parseDate(monthDay, year) {
  if (!monthDay || !year) {
    return new Date().toISOString().split('T')[0];
  }
  // monthDay 格式为 "03-27"，year 格式为 "2026"
  const parts = monthDay.split('-');
  if (parts.length === 2) {
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return `${year}-${monthDay}`;
}

/**
 * 截断摘要文本到指定长度
 * @param {string} text - 原始文本
 * @param {number} maxLength - 最大长度，默认200字符
 * @returns {string} 截断后的文本
 */
function truncateSummary(text, maxLength = 200) {
  if (!text) return '';
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + '...';
}

// ==================== 核心功能 ====================

/**
 * 抓取新闻列表
 * @param {number} pageNum - 页码，默认1（第一页）
 * @returns {Promise<Array>} 新闻数组
 */
async function fetchNewsList(pageNum = 1) {
  const url = pageNum === 1 ? LIST_URL_TEMPLATE : LIST_PAGE_URL_TEMPLATE.replace('{pageNum}', pageNum);

  console.log(`[NewsCrawler] 正在抓取新闻列表，页码: ${pageNum}, URL: ${url}`);

  try {
    const response = await undiciFetch(url, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      dispatcher,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseNewsList(html);
  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.error(`[NewsCrawler] 请求超时: ${url}`);
    } else {
      console.error(`[NewsCrawler] 抓取异常: ${error.message}`);
    }
    throw new Error(`抓取新闻列表失败: ${error.message}`);
  }
}

/**
 * 解析HTML页面中的新闻列表
 * @param {string} html - 页面HTML内容
 * @returns {Array} 解析后的新闻数组
 */
function parseNewsList(html) {
  const $ = cheerio.load(html);
  const newsList = [];

  // 主选择器：新闻列表中的每一条新闻
  // HTML结构：<ul class="news_list list2"> -> <li class="news nX clearfix">
  const $items = $('li.news.clearfix');

  if ($items.length === 0) {
    // fallback：尝试其他可能的选择器
    console.warn('[NewsCrawler] 主选择器未匹配到新闻项，尝试fallback选择器');
    const $fallbackItems = $('.news_list li, .list_item, .wp_article_list li');
    $fallbackItems.each((index, element) => {
      const news = parseNewsItemFallback($(element));
      if (news) newsList.push(news);
    });
    return newsList;
  }

  $items.each((index, element) => {
    const $item = $(element);
    const news = parseNewsItem($item);
    if (news) {
      newsList.push(news);
    }
  });

  console.log(`[NewsCrawler] 成功解析 ${newsList.length} 条新闻`);
  return newsList;
}

/**
 * 解析单条新闻（主解析逻辑）
 * @param {cheerio.Cheerio} $item - cheerio包装的li元素
 * @returns {Object|null} 新闻对象
 */
function parseNewsItem($item) {
  try {
    // 提取标题和URL
    const $titleLink = $item.find('.news_title a').first();
    const title = $titleLink.attr('title') || $titleLink.text().trim();
    let url = $titleLink.attr('href') || '';

    if (!title) return null;

    // 处理URL
    url = resolveUrl(url);

    // 提取日期
    const dateMonth = $item.find('.news_meta .date-month').text().trim();
    const dateYear = $item.find('.news_meta .date-year').text().trim();
    const date = parseDate(dateMonth, dateYear);

    // 提取摘要
    const summaryText = $item.find('.cols_text a').text().trim();
    const summary = truncateSummary(summaryText);

    // 提取图片URL
    let imageUrl = '';
    const $img = $item.find('.news_imgs img').first();
    if ($img.length > 0) {
      imageUrl = resolveUrl($img.attr('src') || '');
    }

    return {
      id: generateId(url),
      title: title,
      url: url,
      date: date,
      summary: summary,
      imageUrl: imageUrl,
      category: CATEGORY,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[NewsCrawler] 解析单条新闻失败: ${error.message}`);
    return null;
  }
}

/**
 * 解析单条新闻（fallback逻辑，用于HTML结构变化时）
 * @param {cheerio.Cheerio} $item - cheerio包装的元素
 * @returns {Object|null} 新闻对象
 */
function parseNewsItemFallback($item) {
  try {
    // 尝试从任意a标签提取标题和链接
    const $link = $item.find('a').first();
    const title = $link.attr('title') || $link.text().trim();
    let url = $link.attr('href') || '';

    if (!title) return null;

    url = resolveUrl(url);

    // 尝试提取日期 - 多种格式
    let date = '';
    const $dateEl = $item.find('.date, .time, .news_date, .meta_date, .news_meta span').first();
    if ($dateEl.length > 0) {
      date = $dateEl.text().trim();
    }

    // 如果日期格式不标准，尝试从URL中提取
    if (!date || date.length < 6) {
      const urlDateMatch = url.match(/\/(\d{4})\/(\d{4})\//);
      if (urlDateMatch) {
        const year = urlDateMatch[1];
        const monthDay = urlDateMatch[2];
        // monthDay 格式如 "0327"，转为 "03-27"
        date = `${year}-${monthDay.substring(0, 2)}-${monthDay.substring(2, 4)}`;
      }
    }

    if (!date) {
      date = new Date().toISOString().split('T')[0];
    }

    // 尝试提取摘要
    let summary = '';
    const $summaryEl = $item.find('.summary, .desc, .description, .cols_text, p').first();
    if ($summaryEl.length > 0) {
      summary = truncateSummary($summaryEl.text().trim());
    }

    // 尝试提取图片
    let imageUrl = '';
    const $img = $item.find('img').first();
    if ($img.length > 0) {
      imageUrl = resolveUrl($img.attr('src') || '');
    }

    return {
      id: generateId(url),
      title: title,
      url: url,
      date: date,
      summary: summary,
      imageUrl: imageUrl,
      category: CATEGORY,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[NewsCrawler] Fallback解析新闻失败: ${error.message}`);
    return null;
  }
}

// ==================== 教务处通知爬取 ====================

/**
 * 抓取教务处通知列表
 * @param {number} pageNum - 页码，默认1
 * @returns {Promise<Array>} 通知数组
 */
async function fetchJwcNoticeList(pageNum = 1) {
  const url = pageNum === 1 ? JWC_LIST_URL : JWC_LIST_PAGE_URL.replace('{pageNum}', pageNum);

  console.log(`[NewsCrawler] 正在抓取教务处通知，页码: ${pageNum}, URL: ${url}`);

  try {
    const response = await undiciFetch(url, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      dispatcher,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseJwcNoticeList(html);
  } catch (error) {
    if (error.name === 'TimeoutError') {
      console.error(`[NewsCrawler] 教务处请求超时: ${url}`);
    } else {
      console.error(`[NewsCrawler] 教务处抓取异常: ${error.message}`);
    }
    throw new Error(`抓取教务处通知失败: ${error.message}`);
  }
}

/**
 * 解析教务处通知列表HTML
 * 教务处页面结构：列表项为 <li class="news nX clearfix">，内含标题链接和日期
 * @param {string} html - 页面HTML
 * @returns {Array} 通知数组
 */
function parseJwcNoticeList(html) {
  const $ = cheerio.load(html);
  const noticeList = [];

  // 教务处列表结构：<ul class="news_list list2"> -> <li class="news nX clearfix">
  const $items = $('li.news.clearfix');

  if ($items.length === 0) {
    // fallback
    const $fallbackItems = $('.news_list li, .list_item, .wp_article_list li');
    $fallbackItems.each((index, element) => {
      const notice = parseJwcNoticeItem($(element));
      if (notice) noticeList.push(notice);
    });
    return noticeList;
  }

  $items.each((index, element) => {
    const $item = $(element);
    const notice = parseJwcNoticeItem($item);
    if (notice) noticeList.push(notice);
  });

  console.log(`[NewsCrawler] 成功解析 ${noticeList.length} 条教务处通知`);
  return noticeList;
}

/**
 * 解析单条教务处通知
 * @param {cheerio.Cheerio} $item - cheerio包装的li元素
 * @returns {Object|null} 通知对象
 */
function parseJwcNoticeItem($item) {
  try {
    // 提取标题和URL
    const $titleLink = $item.find('a').first();
    const title = $titleLink.attr('title') || $titleLink.text().trim();
    let url = $titleLink.attr('href') || '';

    if (!title) return null;

    // 处理URL
    if (!url.startsWith('http')) {
      url = url.startsWith('/') ? JWC_BASE_URL + url : JWC_BASE_URL + '/' + url;
    }

    // 提取日期 - 教务处格式为 "2026-03-24" 或在span中
    let date = '';
    const $dateEl = $item.find('.news_meta, .news_date, .date, .meta_date, span').last();
    if ($dateEl.length > 0) {
      date = $dateEl.text().trim();
    }

    // 如果日期格式不标准，从URL中提取
    if (!date || date.length < 8) {
      const urlDateMatch = url.match(/\/(\d{4})\/(\d{4})\//);
      if (urlDateMatch) {
        const year = urlDateMatch[1];
        const md = urlDateMatch[2];
        date = `${year}-${md.substring(0, 2)}-${md.substring(2, 4)}`;
      }
    }

    if (!date || date.length < 8) {
      date = new Date().toISOString().split('T')[0];
    }

    // 教务处通知没有封面图，标记为附件类型
    return {
      id: generateId(url),
      title: title,
      url: url,
      date: date,
      summary: '', // 教务处通知通常无摘要
      imageUrl: '', // 无封面图
      category: JWC_CATEGORY,
      hasAttachment: true, // 标记为有附件
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[NewsCrawler] 解析教务处通知失败: ${error.message}`);
    return null;
  }
}

// ==================== 抓取新闻详情（校内页面） ====================

/**
 * 抓取新闻详情（校内页面）
 * 微信公众号文章无法直接抓取详情，返回基础信息
 * @param {string} url - 新闻详情页URL
 * @returns {Promise<Object>} 新闻详情对象
 */
async function fetchNewsDetail(url) {
  // 微信公众号文章不支持直接抓取详情
  if (url.includes('mp.weixin.qq.com')) {
    console.log(`[NewsCrawler] 微信公众号文章，跳过详情抓取: ${url}`);
    return {
      title: '',
      content: '该新闻为微信公众号文章，请点击链接查看原文。',
      date: '',
      author: '微信公众号',
      url: url,
      attachments: [],
    };
  }

  console.log(`[NewsCrawler] 正在抓取新闻详情: ${url}`);

  try {
    const response = await undiciFetch(url, {
      headers: REQUEST_HEADERS,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
      dispatcher,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // 提取标题
    const title = $('.Article_Title, .art_title, .news_title, h1, .wp_article_title').first().text().trim();

    // 提取正文内容
    let content = '';
    const $content = $('.Article_Content, .art_content, .news_content, .wp_articlecontent, .entry-content').first();
    if ($content.length > 0) {
      // 移除脚本和样式标签
      $content.find('script, style').remove();
      content = $content.text().trim();
    }

    // 提取附件列表
    let attachments = [];
    const $attachments = $('.wp_articlecontent a[href*="upload"], .Article_Content a[href*="upload"], .Article_Content a[href*="attach"], .art_content a[href*="upload"], .wp_articlecontent .attachment, .Article_Content .attachment');
    if ($attachments.length > 0) {
      $attachments.each((index, el) => {
        const $el = $(el);
        const href = $el.attr('href') || '';
        const text = $el.text().trim() || '附件';
        if (href) {
          attachments.push({
            name: text,
            url: href.startsWith('http') ? href : (url.startsWith('http') ? new URL(href, url).href : href),
          });
        }
      });
    }

    // 提取日期
    const date = $('.Article_PublishDate, .art_date, .news_date, .post-date').first().text().trim();

    // 提取作者
    const author = $('.Article_Author, .art_author, .news_author, .post-author').first().text().trim();

    return {
      title: title || '',
      content: content || '',
      date: date || '',
      author: author || '',
      url: url,
      attachments: attachments,
    };
  } catch (error) {
    console.error(`[NewsCrawler] 抓取新闻详情失败: ${error.message}`);
    throw new Error(`抓取新闻详情失败: ${error.message}`);
  }
}

// ==================== 缓存管理 ====================

/**
 * 更新缓存：将新抓取的新闻合并到缓存中
 * 去重逻辑：基于新闻URL判断是否已存在
 * @param {Array} newNewsList - 新抓取的新闻数组
 * @returns {Array} 新增的新闻数量
 */
function updateCache(newNewsList) {
  let newCount = 0;

  for (const newsItem of newNewsList) {
    // 基于URL去重
    if (!knownUrls.has(newsItem.url)) {
      knownUrls.add(newsItem.url);
      newsCache.unshift(newsItem); // 新新闻插入到数组头部
      newCount++;
    }
  }

  // 按日期降序排列
  newsCache.sort((a, b) => new Date(b.date) - new Date(a.date));

  // 限制缓存大小
  if (newsCache.length > MAX_CACHE_SIZE) {
    const removed = newsCache.splice(MAX_CACHE_SIZE);
    // 从已知URL集合中也移除
    removed.forEach(item => knownUrls.delete(item.url));
  }

  if (newCount > 0) {
    console.log(`[NewsCrawler] 缓存更新完成，新增 ${newCount} 条，当前缓存 ${newsCache.length} 条`);
  } else {
    console.log(`[NewsCrawler] 缓存检查完成，无新增新闻，当前缓存 ${newsCache.length} 条`);
  }

  return newCount;
}

/**
 * 获取缓存的新闻列表
 * @returns {Array} 缓存的新闻数组
 */
function getCachedNews() {
  return [...newsCache];
}

/**
 * 清空缓存
 */
function clearCache() {
  newsCache = [];
  knownUrls.clear();
  console.log('[NewsCrawler] 缓存已清空');
}

// ==================== 定时任务 ====================

/**
 * 执行一次抓取任务（内部方法）
 */
async function runFetchTask() {
  try {
    console.log(`[NewsCrawler] 开始定时抓取任务...`);

    // 并行抓取学校要闻和教务处通知
    const [newsList, jwcList] = await Promise.allSettled([
      fetchNewsList(1),
      fetchJwcNoticeList(1),
    ]);

    if (newsList.status === 'fulfilled') {
      updateCache(newsList.value);
    } else {
      console.error(`[NewsCrawler] 学校要闻抓取失败: ${newsList.reason?.message}`);
    }

    if (jwcList.status === 'fulfilled') {
      updateCache(jwcList.value);
    } else {
      console.error(`[NewsCrawler] 教务处通知抓取失败: ${jwcList.reason?.message}`);
    }
  } catch (error) {
    console.error(`[NewsCrawler] 定时抓取任务失败: ${error.message}`);
  }
}

/**
 * 启动定时抓取任务
 * 每30分钟抓取一次第一页新闻
 * 启动时立即执行一次抓取
 */
function startCron() {
  if (cronTimer) {
    console.warn('[NewsCrawler] 定时任务已在运行中');
    return;
  }

  // 启动时立即执行一次抓取
  runFetchTask();

  // 设置定时任务
  cronTimer = setInterval(() => {
    runFetchTask();
  }, CRON_INTERVAL);

  console.log(`[NewsCrawler] 定时任务已启动，间隔: ${CRON_INTERVAL / 60000} 分钟`);
}

/**
 * 停止定时抓取任务
 */
function stopCron() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    console.log('[NewsCrawler] 定时任务已停止');
  }
}

// ==================== 模块导出 ====================

module.exports = {
  // 核心功能
  fetchNewsList,
  fetchJwcNoticeList,
  fetchNewsDetail,

  // 缓存管理
  getCachedNews,
  clearCache,
  updateCache,

  // 定时任务
  startCron,
  stopCron,
};
