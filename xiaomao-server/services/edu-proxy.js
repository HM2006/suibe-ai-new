/**
 * 教务系统代理服务（修复版）
 *
 * 修复内容：
 * 1. 优化页面等待策略，避免 networkidle2 过于严格
 * 2. 增强错误日志，便于调试
 * 3. 添加超时保护，避免流程卡住
 * 4. 简化等待逻辑，提高稳定性
 */

const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

// ==================== 常量配置 ====================
const EDU_LOGIN_URL = 'https://nbkjw.suibe.edu.cn/student/login?refer=https://nbkjw.suibe.edu.cn/student/home';
const EDU_HOME_URL = 'https://nbkjw.suibe.edu.cn/student/home';
const AUTH_HOST = 'authserver.suibe.edu.cn';
const EDU_HOST = 'nbkjw.suibe.edu.cn';

const NAVIGATION_TIMEOUT = 30000;
const LOGIN_TIMEOUT = 120000;
const PAGE_LOAD_WAIT = 5000;

// ==================== 单例模式 ====================
let instance = null;

class EduProxy {
  constructor() {
    if (instance) {
      throw new Error('EduProxy 是单例类，请使用 EduProxy.getInstance() 获取实例');
    }
    this.browser = null;
    this.page = null;
    this.initialized = false;
    this.loggedIn = false;
    this.cookies = [];
    this.currentUrl = '';
  }

  static getInstance() {
    if (!instance) {
      instance = new EduProxy();
    }
    return instance;
  }

  static resetInstance() {
    if (instance) {
      instance.close().catch(() => {});
      instance = null;
    }
  }

  // ==================== 浏览器生命周期 ====================
  async init() {
    if (this.initialized && this.browser) {
      console.log('[EduProxy] 浏览器已初始化，跳过重复启动');
      return;
    }
    try {
      console.log('[EduProxy] 正在启动 headless 浏览器...');
      const launchArgs = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--window-size=1280,800'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      };
      this.browser = await puppeteer.launch(launchArgs);
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 800 });
      this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      this.initialized = true;
      console.log('[EduProxy] 浏览器启动成功');
    } catch (error) {
      console.error('[EduProxy] 浏览器启动失败:', error.message);
      this.initialized = false;
      this.browser = null;
      this.page = null;
      throw new Error(`浏览器启动失败: ${error.message}`);
    }
  }

  async ensureInitialized() {
    if (!this.initialized || !this.browser) {
      await this.init();
    }
    try {
      if (this.browser && !this.browser.connected) {
        console.log('[EduProxy] 浏览器连接已断开，重新初始化...');
        this.initialized = false;
        await this.init();
      }
    } catch {
      this.initialized = false;
      await this.init();
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('[EduProxy] 浏览器已关闭');
      }
    } catch (error) {
      console.warn('[EduProxy] 关闭浏览器时出错:', error.message);
    } finally {
      this.browser = null;
      this.page = null;
      this.initialized = false;
      this.loggedIn = false;
      this.cookies = [];
      this.currentUrl = '';
    }
  }

  // ==================== 登录流程 ====================
  async getLoginQRCode() {
    await this.ensureInitialized();
    try {
      console.log('[EduProxy] 步骤1：打开教务系统登录页面...');
      await this.page.goto(EDU_LOGIN_URL, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT
      });
      console.log('[EduProxy] 步骤1完成：登录页面已加载');
      await this._delay(1000);

      console.log('[EduProxy] 步骤2：查找SSO登录按钮...');
      const ssoButtonSelectors = [
        'a[href*="authserver"]',
        'button:contains("统一身份认证")',
        'a:contains("统一身份认证")',
        '.login-btn',
        'a[href*="cas"]',
      ];

      let clicked = false;
      for (const selector of ssoButtonSelectors) {
        try {
          const found = await this.page.evaluate((sel) => {
            const links = document.querySelectorAll('a, button');
            for (const link of links) {
              const text = link.textContent || '';
              const href = link.href || '';
              if (
                text.includes('统一身份认证') ||
                text.includes('身份认证') ||
                href.includes('authserver') ||
                href.includes('cas')
              ) {
                link.click();
                return true;
              }
            }
            return false;
          }, selector);
          if (found) {
            clicked = true;
            console.log('[EduProxy] 步骤2完成：已点击SSO登录按钮');
            break;
          }
        } catch (e) {
          console.log(`[EduProxy] 选择器 "${selector}" 未找到，继续尝试下一个...`);
        }
      }

      if (!clicked) {
        console.log('[EduProxy] 步骤2备选：未找到SSO按钮，尝试直接访问认证页面');
      }

      console.log('[EduProxy] 步骤3：等待跳转到统一身份认证平台...');
      try {
        await this.page.waitForFunction(
          () => window.location.hostname.includes('authserver'),
          { timeout: 10000 }
        );
      } catch (e) {
        const currentUrl = this.page.url();
        if (!currentUrl.includes('authserver')) {
          throw new Error(`无法跳转到统一身份认证平台。当前URL: ${currentUrl}`);
        }
      }
      console.log('[EduProxy] 步骤3完成：已跳转到认证页面');
      await this._delay(2000);

      console.log('[EduProxy] 步骤4：等待认证页面完全加载...');
      await this.page.waitForFunction(
        () => {
          return document.readyState === 'complete' &&
                 document.body &&
                 document.body.innerHTML.length > 1000;
        },
        { timeout: 10000 }
      );
      console.log('[EduProxy] 步骤4完成：认证页面已完全加载');

      console.log('[EduProxy] 步骤5：只截取二维码区域...');
      // 尝试找到二维码图片元素并截取
      let qrCodeImage;
      try {
        // 方法1：查找二维码img元素
        const qrElement = await this.page.$('img[src*="qrcode"], img[src*="qr"], .qrcode img, #qrcode img, .qr-code img');
        if (qrElement) {
          qrCodeImage = await qrElement.screenshot({ type: 'png', encoding: 'base64' });
          console.log('[EduProxy] 步骤5完成：通过元素选择器截取二维码');
        } else {
          // 方法2：查找包含二维码的容器（通常是特定class或id）
          const qrContainer = await this.page.$('.qrcode, #qrcode, .qr-code, .wx-qr, .wechat-qr, [class*="qrcode"], [class*="qr-code"]');
          if (qrContainer) {
            qrCodeImage = await qrContainer.screenshot({ type: 'png', encoding: 'base64' });
            console.log('[EduProxy] 步骤5完成：通过容器选择器截取二维码');
          } else {
            // 方法3：截取整个页面中间区域（二维码通常在页面中央）
            const viewport = this.page.viewport();
            const clip = {
              x: Math.floor(viewport.width * 0.2),
              y: Math.floor(viewport.height * 0.15),
              width: Math.floor(viewport.width * 0.6),
              height: Math.floor(viewport.height * 0.6),
            };
            qrCodeImage = await this.page.screenshot({
              type: 'png',
              encoding: 'base64',
              clip
            });
            console.log('[EduProxy] 步骤5完成：通过区域裁剪截取二维码');
          }
        }
      } catch (screenshotErr) {
        console.warn('[EduProxy] 元素截图失败，使用全页截图:', screenshotErr.message);
        qrCodeImage = await this.page.screenshot({ type: 'png', fullPage: true, encoding: 'base64' });
      }
      this.currentUrl = this.page.url();
      console.log('[EduProxy] 步骤5完成：二维码截图获取成功');
      console.log(`[EduProxy] 当前认证页面URL: ${this.currentUrl}`);
      return {
        qrCodeImage,
        loginUrl: this.currentUrl
      };
    } catch (error) {
      console.error('[EduProxy] 获取登录二维码失败:', error.message);
      console.error('[EduProxy] 错误堆栈:', error.stack);
      throw new Error(`获取登录二维码失败: ${error.message}`);
    }
  }

  async waitForLogin(timeout = LOGIN_TIMEOUT) {
    if (!this.page) {
      throw new Error('浏览器未初始化');
    }
    if (this.loggedIn) {
      return { success: true, cookies: this.cookies };
    }
    console.log(`[EduProxy] 等待用户扫码登录，超时时间: ${timeout}ms...`);
    try {
      await this.page.waitForFunction(
        () => window.location.hostname.includes('nbkjw'),
        { timeout }
      );
      await this._delay(2000);
      const finalUrl = this.page.url();
      if (!finalUrl.includes(EDU_HOST)) {
        throw new Error('登录未完成，页面未跳转回教务系统');
      }
      this.cookies = await this.page.cookies();
      this.currentUrl = finalUrl;
      this.loggedIn = true;
      console.log('[EduProxy] 登录成功！');
      console.log(`[EduProxy] 已保存 ${this.cookies.length} 个 cookies`);
      return {
        success: true,
        cookies: this.cookies
      };
    } catch (error) {
      if (error.message.includes('waiting')) {
        console.log('[EduProxy] 等待登录超时');
        return { success: false, message: '等待登录超时，请重新扫码' };
      }
      console.error('[EduProxy] 等待登录失败:', error.message);
      return { success: false, message: error.message };
    }
  }

  async checkLoginStatus() {
    if (!this.loggedIn || !this.page) {
      return false;
    }
    try {
      // loggedIn 标志在 waitForLogin 中设置，直接信任即可
      // 不再检查 URL（登录后页面可能在 authserver 域名下）
      return true;
    } catch {
      return false;
    }
  }

  // ==================== 课表查询 ====================
  async getSchedule() {
    await this._ensureLoggedIn();
    try {
      console.log('[EduProxy] 正在获取课表...');
      const scheduleUrl = 'https://nbkjw.suibe.edu.cn/student/for-std/course-table';
      console.log(`[EduProxy] 访问课表页面: ${scheduleUrl}`);
      await this.page.goto(scheduleUrl, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT
      });
      /* 等待课表数据加载完成（AJAX动态渲染） */
      await this._delay(PAGE_LOAD_WAIT);
      /* 等待表格出现 */
      try {
        await this.page.waitForSelector('table', { timeout: 10000 });
      } catch (e) {
        console.log('[EduProxy] 等待表格超时，尝试继续解析...');
      }
      const html = await this.page.content();
      if (!html) {
        throw new Error('课表页面内容为空');
      }
      const $ = cheerio.load(html);

      /*
       * 真实课表HTML结构（通过浏览器实际查看确认）：
       * - table布局，列头：节次、星期一~星期日
       * - 每行对应一个节次（1-14），每列对应一天
       * - 课程cell格式：课程名 课程代码 (周次) (节次) 校区 教室 教师 人数:选课/容量
       * - 例如："（选）管理学 A230510096020-003 (1~16周) (1-2节)  松江 SA201  杨浩 人数:62/60"
       *
       * 重要发现：
       * 1. 同一门课可能跨多行（如数据结构基础在3-4节和5节各出现一次）
       * 2. 同一节次同一列可能有多个课程（如6-7节有4门课）
       * 3. 需要用课程代码去重，避免同一门课被重复添加
       * 4. slot应使用解析出的起始节次，而非当前行号
       */
      const rows = $('table tr');
      const dayMap = {}; // 按星期几分组
      const courseCodeSet = {}; // 用于去重：key = "dayIndex-courseCode"

      rows.each((rowIndex, rowEl) => {
        const cells = $(rowEl).find('td');
        if (cells.length < 2) return;

        /* 第一列是节次号 */
        const periodText = $(cells[0]).text().trim();
        const periodNum = parseInt(periodText);
        if (isNaN(periodNum)) return; // 跳过表头行

        /* 遍历每个星期列（第2~8列对应周一~周日） */
        for (let colIndex = 1; colIndex < cells.length && colIndex <= 7; colIndex++) {
          const cellText = $(cells[colIndex]).text().trim();
          if (!cellText || cellText === periodText) continue;

          /* 解析课程信息 */
          const course = this._parseScheduleCell(cellText, periodNum, colIndex);
          if (course) {
            const dayKey = colIndex - 1; // 0=周一, 1=周二...

            /* 用课程代码+星期去重，避免同一门课跨多行时重复添加 */
            const dedupeKey = course.code ? `${dayKey}-${course.code}` : `${dayKey}-${course.name}-${course.time}`;
            if (courseCodeSet[dedupeKey]) continue;
            courseCodeSet[dedupeKey] = true;

            if (!dayMap[dayKey]) dayMap[dayKey] = [];
            dayMap[dayKey].push(course);
          }
        }
      });

      /* 转换为前端期望的格式 */
      const scheduleData = {};
      const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
      for (let d = 0; d < 7; d++) {
        scheduleData[d] = dayMap[d] || [];
      }

      /* 提取MOOC课程信息（在"全部课程"tab中，备注字段包含MOOC信息） */
      let moocCourses = [];
      try {
        console.log('[EduProxy] 正在提取MOOC课程信息...');
        /* 点击"全部课程"tab */
        const allCourseTab = await this.page.$('li[data-toggle="tab"]:has(a:has-text("全部课程"))')
          || await this.page.$('a:has-text("全部课程")');
        if (allCourseTab) {
          await allCourseTab.click();
          await this._delay(3000);

          /* 从"全部课程"tab的HTML中提取含MOOC/备注的课程 */
          const allCourseHtml = await this.page.content();
          const $all = cheerio.load(allCourseHtml);

          /* 查找所有包含"备注"的单元格 */
          $all('td, div, span').each((i, el) => {
            const text = $all(el).text().trim();
            if (!text.includes('备注') && !text.includes('MOOC') && !text.includes('mooc')) return;

            /* 检查是否为MOOC课程 */
            if (!text.includes('MOOC') && !text.includes('mooc')) return;

            /* 提取课程名 */
            let courseName = '';
            const nameMatch = text.match(/（选）?([^\s]+(?:沟通|谈判|自我推销|职场|英语|体育|超星|智慧树|学堂)[^\s]*)/);
            if (nameMatch) {
              courseName = nameMatch[1].replace(/[A-Z]\d{10,}[\w-]*/g, '').replace(/（MOOC）/gi, '').replace(/（\d+）/g, '').trim();
            }
            if (!courseName) {
              /* 通用提取：取第一个中文名称 */
              const genericMatch = text.match(/（选）?([\u4e00-\u9fa5]{2,30}（MOOC）)/);
              if (genericMatch) courseName = genericMatch[1].replace(/（MOOC）/gi, '').trim();
            }
            if (!courseName) return;

            /* 匹配平台 */
            let platform = { name: '其他平台', url: '' };
            if (text.includes('学堂在线') || text.includes('雨课堂')) {
              platform = { name: '雨课堂', url: 'https://suibe.yuketang.cn/' };
            } else if (text.includes('超星尔雅') || text.includes('超星')) {
              platform = { name: '学习通（超星尔雅）', url: 'https://i.chaoxing.com' };
            } else if (text.includes('智慧树')) {
              platform = { name: '智慧树', url: 'https://www.zhihuishu.com/' };
            }

            /* 提取备注链接 */
            let remarkUrl = '';
            const urlMatch = text.match(/(https?:\/\/[^\s"'）)]+)/);
            if (urlMatch) remarkUrl = urlMatch[1];

            moocCourses.push({ name: courseName, platform: platform.name, platformUrl: platform.url, remarkUrl });
          });

          /* 切回课表tab */
          const scheduleTab = await this.page.$('li[data-toggle="tab"]:has(a:has-text("课表"))')
            || await this.page.$('a:has-text("课表")');
          if (scheduleTab) await scheduleTab.click();
          await this._delay(1000);
        }
      } catch (err) {
        console.warn('[EduProxy] MOOC信息提取失败:', err.message);
      }
      console.log(`[EduProxy] MOOC课程提取完成，发现 ${moocCourses.length} 门`);

      const now = new Date();
      let dayOfWeek = now.getDay();
      dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;

      /* 统计总课程数 */
      let totalCourses = 0;
      Object.values(scheduleData).forEach(courses => totalCourses += courses.length);

      console.log(`[EduProxy] 课表获取完成，共 ${totalCourses} 门课程`);
      return {
        weekday: weekdays[dayOfWeek - 1],
        day: dayOfWeek,
        courseCount: totalCourses,
        courses: scheduleData,
        moocCourses,
      };
    } catch (error) {
      console.error('[EduProxy] 获取课表失败:', error.message);
      throw new Error(`获取课表失败: ${error.message}`);
    }
  }

  /**
   * 解析课表单元格文本
   * 格式示例："（选）管理学 A230510096020-003 (1~16周) (1-2节)  松江 SA201  杨浩 人数:62/60"
   * 特殊情况："形势与政策（4） A120310030051-006 (6周) (11-12节)  松江 SD3  刘一平 (8周) (11-12节)  松江 SD3 单泓睿 (10周) (11-12节)  松江 SD3 张毓格 人数:201/230"
   */
  _parseScheduleCell(text, periodNum, dayIndex) {
    /* 提取课程名（第一个词或括号内容，在课程代码之前） */
    const nameMatch = text.match(/^(.+?)\s+[A-Z]\d{10,}/);
    let name = nameMatch ? nameMatch[1].trim() : '';
    if (!name) {
      const parts = text.split(/\s+/);
      name = parts[0] || '';
    }

    /* 提取课程代码 */
    const codeMatch = text.match(/([A-Z]\d{10,}-\d{3})/);
    const code = codeMatch ? codeMatch[1] : '';

    /* 提取周次 - 支持多种格式 */
    const weekMatch = text.match(/\((\d+[~\-]?\d*周|\d+,\d+[~\-]?\d*周)\)/);
    const weeks = weekMatch ? weekMatch[1] : '';

    /* 提取节次 - 使用第一个出现的节次作为slot */
    const slotMatch = text.match(/\((\d+)-(\d+)节\)/);
    const time = slotMatch ? `${slotMatch[1]}-${slotMatch[2]}节` : `${periodNum}-${periodNum}节`;
    /* slot使用解析出的起始节次（0-based），而非当前行号 */
    const startSlot = slotMatch ? parseInt(slotMatch[1]) - 1 : periodNum - 1;
    /* endSlot使用解析出的结束节次（0-based），用于前端跨行显示 */
    const endSlot = slotMatch ? parseInt(slotMatch[2]) - 1 : periodNum - 1;

    /* 提取教室（"松江 SA201" 格式） */
    const locationMatch = text.match(/(松江|长宁|浦东)\s+(\S+)/);
    const location = locationMatch ? `${locationMatch[1]} ${locationMatch[2]}` : '';

    /* 提取教师（取第一个教师名，教室后面的第一个名字） */
    const teacherMatch = text.match(/(?:松江|长宁|浦东)\s+\S+\s+(\S+)/);
    let teacher = teacherMatch ? teacherMatch[1] : '';
    /* 清理教师名中可能混入的"人数:xx/xx"后缀 */
    teacher = teacher.replace(/人数[:：]?\d+\/\d+.*$/, '').trim();

    /* 提取人数 */
    const enrollmentMatch = text.match(/人数[:：]?(\d+)\/(\d+)/);
    const enrollment = enrollmentMatch ? `${enrollmentMatch[1]}/${enrollmentMatch[2]}` : '';

    /* 判断课程类型 */
    const isElective = name.includes('（选）') || name.includes('(选)');
    const type = isElective ? '选修' : '必修';

    if (!name) return null;

    return {
      name: name.replace(/^（选）/, '').replace(/^\(选\)/, ''),
      fullName: name,
      code,
      teacher,
      location,
      time,
      slot: startSlot,
      endSlot,
      day: dayIndex,
      weeks,
      type,
      enrollment,
      color: 0, // 前端会分配颜色
    };
  }

  // ==================== 成绩查询 ====================
  /**
   * GPA标准转换表（上海对外经贸大学标准 4.0 制）
   * 按分数段转换，而非按等级
   */
  _scoreToGpaPoint(score) {
    if (isNaN(score) || score < 0) return 0;
    if (score >= 90) return 4.0;
    if (score >= 85) return 3.7;
    if (score >= 82) return 3.3;
    if (score >= 78) return 3.0;
    if (score >= 75) return 2.7;
    if (score >= 72) return 2.3;
    if (score >= 68) return 2.0;
    if (score >= 64) return 1.5;
    if (score >= 60) return 1.0;
    return 0;
  }

  /**
   * 分数转等级文字（仅用于前端展示）
   */
  _scoreToGradeText(score) {
    if (isNaN(score)) return '';
    if (score >= 90) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 82) return 'B+';
    if (score >= 78) return 'B';
    if (score >= 75) return 'B-';
    if (score >= 72) return 'C+';
    if (score >= 68) return 'C';
    if (score >= 64) return 'C-';
    if (score >= 60) return 'D';
    return 'F';
  }

  async getGrades() {
    await this._ensureLoggedIn();
    try {
      console.log('[EduProxy] 正在获取成绩...');
      /* 真实成绩页面URL - 会自动跳转到学期索引页 */
      const gradesUrl = 'https://nbkjw.suibe.edu.cn/student/for-std/grade/sheet';
      console.log(`[EduProxy] 访问成绩页面: ${gradesUrl}`);
      await this.page.goto(gradesUrl, {
        waitUntil: 'load',
        timeout: NAVIGATION_TIMEOUT
      });
      await this._delay(PAGE_LOAD_WAIT);

      /* 等待表格出现 */
      try {
        await this.page.waitForSelector('table', { timeout: 10000 });
      } catch (e) {
        console.log('[EduProxy] 等待成绩表格超时，尝试继续解析...');
      }

      const html = await this.page.content();
      if (!html) {
        throw new Error('成绩页面内容为空');
      }
      const $ = cheerio.load(html);
      const grades = [];
      let totalCredits = 0;
      let totalGpaPoints = 0;
      let gpaCreditSum = 0;

      /*
       * 真实成绩HTML结构（通过浏览器实际查看确认）：
       * - 页面URL会跳转到 semester-index/xxxxx
       * - 按学期分组，每学期一个h3标题（如"2025-2026学年 第一学期"）
       * - 每个学期一个table
       * - 表头列：课程名称 | 学分 | 绩点 | 总评成绩 | 补考成绩 | 最终成绩
       * - 课程名格式："课程名 课程代码  |  必修课/选修课  |  类别  |  必修/选修"
       * - 成绩绝大多数是数字分数（89、82、78等），少数为"合格"
       * - 绩点由页面直接提供（3.7、3.3、4.0等）
       * - 最终成绩列在补考成绩之后（第6列，index=5），补考成绩通常为空
       *
       * 优化策略：
       * 1. 优先使用总评成绩（数字分数），而非等级文字
       * 2. 如果总评成绩是等级文字（合格/优秀等），尝试用最终成绩的数字
       * 3. GPA按分数标准转换（90+→4.0, 85-89→3.7等），同时保留页面原始绩点
       */
      const headings = $('h3');
      const tables = $('table');

      headings.each((hIndex, hEl) => {
        const semesterText = $(hEl).text().trim();
        /* 提取学期标识，如 "2025-2026学年 第一学期" -> "2025-2026-1" */
        const semMatch = semesterText.match(/(\d{4}-\d{4})学年\s+(第[一二三四五六七八九十]+学期)/);
        let semester = '';
        if (semMatch) {
          const semNumMap = { '一': '1', '二': '2', '三': '3', '四': '4' };
          const num = semMatch[2].replace('第', '').replace('学期', '');
          semester = `${semMatch[1]}-${semNumMap[num] || num}`;
        }

        /* 找到对应的表格 */
        const table = tables.eq(hIndex);
        if (!table.length) return;

        const rows = table.find('tr');
        rows.each((rIndex, rEl) => {
          const cells = $(rEl).find('td');
          /* 跳过表头行（课程名称、学分、绩点...） */
          if (cells.length < 5) return;
          const firstCellText = $(cells[0]).text().trim();
          if (firstCellText === '课程名称') return;

          /* 解析课程名 */
          /* 格式："创新创业拓展 A120310004010  |  必修课  |  创新创业拓展  |" */
          /* 注意：课程代码可能紧跟课程名（无空格），如"创新创业拓展A120310004010" */
          const courseNameMatch = firstCellText.match(/^(.+?)\s+[A-Z]\d{10,}/)
            || firstCellText.match(/^(.+?)[A-Z]\d{10,}/);
          const courseName = courseNameMatch ? courseNameMatch[1].trim() : firstCellText.split(/\s+/)[0];

          /* 解析课程类型 - 格式："| 必修课 |" 或 "| 选修课 |" */
          const isRequired = firstCellText.includes('必修课');
          const isElective = firstCellText.includes('选修课');
          let type = '必修';
          if (isElective && !isRequired) type = '选修';

          /* 学分 */
          const credit = parseFloat($(cells[1]).text().trim()) || 0;

          /* 页面上的绩点（仅供参考，我们用自己的标准转换） */
          const pageGpaPoint = parseFloat($(cells[2]).text().trim()) || 0;

          /* 总评成绩 - 优先使用数字分数 */
          const scoreText = $(cells[3]).text().trim();
          let score = parseFloat(scoreText);
          const isScoreText = !isNaN(score);

          /* 最终成绩（补考/重修后的成绩） */
          const finalScoreText = $(cells.length > 5 ? cells[5] : cells[4]).text().trim();
          const finalScore = parseFloat(finalScoreText);

          /* 判断是否为等级文字（合格/优秀/良好/及格/不及格） */
          const gradeLevelTexts = ['优秀', '良好', '中等', '及格', '合格', '不合格', '不及格'];
          const isGradeLevelText = !isScoreText && gradeLevelTexts.some(t => scoreText.includes(t));

          /*
           * 成绩取值策略（按优先级）：
           * 1. 总评成绩是数字 → 直接使用
           * 2. 总评成绩是等级文字，最终成绩是数字 → 使用最终成绩
           * 3. 总评成绩是等级文字 → 将等级映射为分数用于GPA计算
           */
          let displayScore;
          let gpaScore;

          if (isScoreText) {
            /* 总评成绩是数字，直接使用 */
            displayScore = score;
            gpaScore = score;
          } else if (!isNaN(finalScore)) {
            /* 总评是等级文字，最终成绩有数字 */
            displayScore = finalScore;
            gpaScore = finalScore;
          } else if (isGradeLevelText) {
            /* 等级文字映射为分数（用于GPA计算） */
            const gradeScoreMap = {
              '优秀': 90,
              '良好': 85,
              '中等': 78,
              '及格': 68,
              '合格': 82,
              '不合格': 50,
              '不及格': 50,
            };
            const mappedScore = gradeLevelTexts.find(t => scoreText.includes(t));
            displayScore = scoreText; /* 显示原始等级文字 */
            gpaScore = mappedScore ? gradeScoreMap[mappedScore] : 0;
          } else {
            displayScore = scoreText;
            gpaScore = 0;
          }

          if (!courseName) return;

          /* 使用标准分数计算GPA，而非页面上的绩点 */
          const calculatedGpaPoint = this._scoreToGpaPoint(gpaScore);

          grades.push({
            courseName,
            credit,
            score: typeof displayScore === 'number' ? displayScore : displayScore,
            /* scoreNum 始终是数字，用于前端排序和GPA计算 */
            scoreNum: gpaScore,
            gpaPoint: calculatedGpaPoint,
            pageGpaPoint,
            finalScore: isNaN(finalScore) ? finalScoreText : finalScore,
            grade: this._scoreToGradeText(gpaScore),
            semester,
            type,
          });

          totalCredits += credit;
          /* 只统计60分及以上的课程GPA */
          if (gpaScore >= 60) {
            totalGpaPoints += calculatedGpaPoint * credit;
            gpaCreditSum += credit;
          }
        });
      });

      const gpa = gpaCreditSum > 0 ? Math.round((totalGpaPoints / gpaCreditSum) * 100) / 100 : 0;
      console.log(`[EduProxy] 成绩获取完成，共 ${grades.length} 门课程，GPA: ${gpa}`);
      return {
        gpa,
        totalCredits,
        courseCount: grades.length,
        grades
      };
    } catch (error) {
      console.error('[EduProxy] 获取成绩失败:', error.message);
      throw new Error(`获取成绩失败: ${error.message}`);
    }
  }

  // ==================== 辅助方法 ====================
  async _ensureLoggedIn() {
    if (!this.loggedIn) {
      throw new Error('未登录教务系统，请先完成扫码登录');
    }
    try {
      await this.ensureInitialized();
      const currentUrl = this.page.url();
      if (!currentUrl.includes(EDU_HOST)) {
        console.log('[EduProxy] 当前不在教务系统页面，尝试恢复会话...');
        await this.page.goto(EDU_HOME_URL, {
          waitUntil: 'load',
          timeout: NAVIGATION_TIMEOUT
        });
        const newUrl = this.page.url();
        if (newUrl.includes('authserver') || newUrl.includes('login')) {
          this.loggedIn = false;
          throw new Error('登录会话已过期，请重新扫码登录');
        }
      }
    } catch (error) {
      if (error.message.includes('重新扫码')) {
        throw error;
      }
      this.loggedIn = false;
      throw new Error('登录状态验证失败，请重新扫码登录');
    }
  }

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _scoreToGrade(score) {
    if (isNaN(score)) return '';
    if (score >= 90) return 'A';
    if (score >= 85) return 'A-';
    if (score >= 82) return 'B+';
    if (score >= 78) return 'B';
    if (score >= 75) return 'B-';
    if (score >= 72) return 'C+';
    if (score >= 68) return 'C';
    if (score >= 64) return 'C-';
    if (score >= 60) return 'D';
    return 'F';
  }

  _calculateGPA(grades) {
    let totalPoints = 0;
    let totalCredits = 0;
    for (const item of grades) {
      const score = parseFloat(item.score);
      const credit = parseFloat(item.credit);
      if (isNaN(score) || isNaN(credit) || credit === 0) continue;
      let point = 0;
      if (score >= 90) point = 4.0;
      else if (score >= 85) point = 3.7;
      else if (score >= 82) point = 3.3;
      else if (score >= 78) point = 3.0;
      else if (score >= 75) point = 2.7;
      else if (score >= 72) point = 2.3;
      else if (score >= 68) point = 2.0;
      else if (score >= 64) point = 1.5;
      else if (score >= 60) point = 1.0;
      else point = 0;
      totalPoints += point * credit;
      totalCredits += credit;
    }
    return totalCredits > 0 ? totalPoints / totalCredits : 0;
  }
}

module.exports = EduProxy;
