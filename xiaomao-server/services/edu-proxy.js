/**
 * 教务系统代理服务（纯 HTTP 版）
 *
 * 完全移除 Puppeteer 依赖，所有功能通过 HTTP 请求实现：
 * 1. 登录：通过 HTTP 跟随 SSO 重定向链 → 获取二维码 → 轮询扫码状态 → 提交登录
 * 2. 课表/成绩：通过 axios + cookie 调用后端 API
 * 3. 资源占用极低，无需 Chrome/Chromium
 *
 * 认证流程（纯 HTTP）：
 * 1. GET /student/sso/login → 302 到 authserver（获取 session cookie）
 * 2. GET /authserver/login?service=... → 200（获取 JSESSIONID + lt ticket）
 * 3. GET /authserver/qrCode/get → UUID
 * 4. GET /authserver/qrCode/code?uuid=UUID → 二维码 PNG 图片
 * 5. 轮询 GET /authserver/qrCode/status?uuid=UUID → "0"(等待)/"1"(确认)/"2"(已扫)/"3"(失效)
 * 6. POST /authserver/login (lt + dllt=qrLogin + uuid) → 302 重定向链 → 最终 cookie
 */

const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cheerio = require('cheerio');

// ==================== 常量配置 ====================
const EDU_HOST = 'nbkjw.suibe.edu.cn';
const EDU_BASE_URL = `https://${EDU_HOST}`;
const AUTH_HOST = 'authserver.suibe.edu.cn';
const AUTH_BASE_URL = `https://${AUTH_HOST}`;

const SSO_SERVICE_URL = `${EDU_BASE_URL}/student/sso/login`;
const AUTH_LOGIN_URL = `${AUTH_BASE_URL}/authserver/login`;
const QR_CODE_GET_URL = `${AUTH_BASE_URL}/authserver/qrCode/get`;
const QR_CODE_IMG_URL = `${AUTH_BASE_URL}/authserver/qrCode/code`;
const QR_CODE_STATUS_URL = `${AUTH_BASE_URL}/authserver/qrCode/status`;

const LOGIN_TIMEOUT = 120000; // 扫码等待超时 2 分钟
const QR_POLL_INTERVAL = 2000; // 轮询间隔 2 秒

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/* 代理配置：自动检测环境变量中的 HTTP_PROXY / HTTPS_PROXY */
const PROXY_URL = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
const PROXY_AGENT = PROXY_URL ? new HttpsProxyAgent(PROXY_URL) : null;

if (PROXY_URL) {
  console.log(`[EduProxy] 检测到代理: ${PROXY_URL}`);
}

// ==================== 单例模式 ====================
let instance = null;

class EduProxy {
  constructor() {
    if (instance) {
      throw new Error('EduProxy 是单例类，请使用 EduProxy.getInstance() 获取实例');
    }
    this.loggedIn = false;
    this.cookies = [];           // 原始 cookie 对象列表 [{name, value, domain, ...}]
    this.cookieJar = {};         // 快速查找: { "cookieName": "cookieValue" }
    /* 认证相关状态 */
    this.qrUuid = null;
    this.ltTicket = null;
    this.authSessionId = null;   // authserver 的 JSESSIONID
    /* API 相关参数 - 登录后自动获取 */
    this.studentId = null;
    this.semesterId = null;
    this.semesterName = '';
    /* axios 实例（带 cookie，用于教务系统 API） */
    this.axiosInstance = null;
  }

  static getInstance() {
    if (!instance) {
      instance = new EduProxy();
    }
    return instance;
  }

  static resetInstance() {
    if (instance) {
      instance.close();
      instance = null;
    }
  }

  // ==================== 生命周期 ====================

  close() {
    this.loggedIn = false;
    this.cookies = [];
    this.cookieJar = {};
    this.qrUuid = null;
    this.ltTicket = null;
    this.authSessionId = null;
    this.studentId = null;
    this.semesterId = null;
    this.axiosInstance = null;
    console.log('[EduProxy] 实例已重置');
  }

  // ==================== Cookie 管理 ====================

  /**
   * 从 axios 响应中提取 set-cookie 并合并到 cookieJar
   */
  _mergeCookies(response) {
    const setCookies = response.headers?.['set-cookie'] || [];
    for (const raw of setCookies) {
      const eqIdx = raw.indexOf('=');
      if (eqIdx === -1) continue;
      const semiIdx = raw.indexOf(';');
      const name = raw.substring(0, eqIdx).trim();
      const value = raw.substring(eqIdx + 1, semiIdx > eqIdx ? semiIdx : undefined).trim();
      if (name && value) {
        this.cookieJar[name] = value;
      }
    }
  }

  /**
   * 创建带 cookie 捕获功能的 axios 请求配置
   * 使用 beforeRedirect 回调在每次重定向时捕获 set-cookie
   */
  _cookieCaptureConfig(extraHeaders = {}) {
    const config = {
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': this._cookieString(),
        ...extraHeaders,
      },
      maxRedirects: 10,
      timeout: 15000,
      /* 禁用 axios 内置 proxy（避免明文 HTTP 发到 HTTPS 端口） */
      proxy: false,
      beforeRedirect: (options, { responseHeaders }) => {
        const setCookies = responseHeaders?.['set-cookie'] || [];
        for (const raw of setCookies) {
          const eqIdx = raw.indexOf('=');
          if (eqIdx === -1) continue;
          const semiIdx = raw.indexOf(';');
          const name = raw.substring(0, eqIdx).trim();
          const value = raw.substring(eqIdx + 1, semiIdx > eqIdx ? semiIdx : undefined).trim();
          if (name && value) {
            this.cookieJar[name] = value;
          }
        }
        /* 更新下一次请求的 Cookie 头 */
        options.headers = options.headers || {};
        options.headers['Cookie'] = this._cookieString();
      },
    };
    /* 使用 CONNECT 隧道代理 */
    if (PROXY_AGENT) {
      config.httpsAgent = PROXY_AGENT;
    }
    return config;
  }

  /**
   * 将 cookieJar 转为 Cookie 头字符串
   */
  _cookieString() {
    return Object.entries(this.cookieJar)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  /**
   * 将 cookieJar 转为 puppeteer 格式的 cookie 列表（兼容前端缓存）
   */
  _cookieList() {
    return Object.entries(this.cookieJar).map(([name, value]) => ({
      name,
      value,
      domain: EDU_HOST,
      path: '/',
    }));
  }

  // ==================== 登录流程（纯 HTTP） ====================

  /**
   * 获取登录二维码
   *
   * 流程：
   * 1. GET /student/sso/login → 跟随 302 到 authserver，收集 cookie
   * 2. GET /authserver/login?service=... → 获取 JSESSIONID + lt ticket
   * 3. GET /authserver/qrCode/get → 获取二维码 UUID
   * 4. GET /authserver/qrCode/code?uuid=UUID → 获取二维码图片
   */
  async getLoginQRCode() {
    try {
      console.log('[EduProxy] 步骤1：访问 SSO 入口，跟随重定向到认证服务器...');

      /*
       * 步骤1：GET /student/sso/login
       * 让 axios 自动跟随 302 重定向到 authserver，同时收集 cookie
       */
      const serviceParam = encodeURIComponent(SSO_SERVICE_URL);
      const ssoResponse = await axios.get(SSO_SERVICE_URL, this._cookieCaptureConfig({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      }));

      this._mergeCookies(ssoResponse);
      console.log(`[EduProxy] 步骤1完成：SSO cookie 已获取 (${Object.keys(this.cookieJar).length} 个)`);

      /*
       * 步骤2：GET /authserver/login?service=...
       * 获取认证页面，提取 JSESSIONID 和 lt ticket
       */
      console.log('[EduProxy] 步骤2：访问认证服务器登录页面...');
      const authResponse = await axios.get(
        `${AUTH_LOGIN_URL}?service=${serviceParam}`,
        this._cookieCaptureConfig({
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': EDU_BASE_URL,
        })
      );

      this._mergeCookies(authResponse);
      this.authSessionId = this.cookieJar['JSESSIONID'] || null;
      console.log(`[EduProxy] 步骤2完成：JSESSIONID=${this.authSessionId ? '已获取' : '未获取'}`);

      /* 从 HTML 中提取表单隐藏字段 */
      const html = authResponse.data || '';
      const $ = require('cheerio').load(html);
      const $form = $('#qrLoginForm');

      /* 提取表单 action URL（包含 jsessionid） */
      let formAction = $form.attr('action') || '';
      if (formAction.startsWith('/')) {
        formAction = AUTH_BASE_URL + formAction;
      }
      this.loginFormAction = formAction;
      console.log(`[EduProxy] 表单 action: ${formAction.substring(0, 100)}...`);

      /* 提取所有隐藏字段 */
      this.loginFormFields = {};
      $form.find('input[type="hidden"]').each((_, el) => {
        const name = $(el).attr('name');
        const value = $(el).attr('value') || '';
        if (name) this.loginFormFields[name] = value;
      });

      this.ltTicket = this.loginFormFields['lt'];
      if (!this.ltTicket) {
        throw new Error('无法从认证页面提取 lt ticket，页面结构可能已变更');
      }
      console.log(`[EduProxy] lt ticket: ${this.ltTicket}`);
      console.log(`[EduProxy] 表单字段: ${Object.keys(this.loginFormFields).join(', ')}`);

      /*
       * 步骤3：GET /authserver/qrCode/get → 获取二维码 UUID
       */
      console.log('[EduProxy] 步骤3：获取二维码 UUID...');
      const uuidResponse = await axios.get(QR_CODE_GET_URL, {
        params: { ts: Date.now() },
        proxy: false,
        ...(PROXY_AGENT ? { httpsAgent: PROXY_AGENT } : {}),
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': '*/*',
          'Cookie': this._cookieString(),
          'Referer': `${AUTH_LOGIN_URL}?service=${serviceParam}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 10000,
      });

      this.qrUuid = typeof uuidResponse.data === 'string'
        ? uuidResponse.data.trim()
        : String(uuidResponse.data).trim();

      if (!this.qrUuid || !this.qrUuid.startsWith('QR-')) {
        throw new Error(`获取二维码 UUID 失败: ${this.qrUuid}`);
      }
      console.log(`[EduProxy] 步骤3完成：UUID=${this.qrUuid}`);

      /* 更新表单的 uuid 字段（模拟前端 $("#uuid").val(data)） */
      if (this.loginFormFields) {
        this.loginFormFields['uuid'] = this.qrUuid;
      }

      /*
       * 步骤4：GET /authserver/qrCode/code?uuid=UUID → 获取二维码图片
       */
      console.log('[EduProxy] 步骤4：下载二维码图片...');
      const imgResponse = await axios.get(QR_CODE_IMG_URL, {
        params: { uuid: this.qrUuid },
        proxy: false,
        ...(PROXY_AGENT ? { httpsAgent: PROXY_AGENT } : {}),
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'image/png,image/*',
          'Cookie': this._cookieString(),
          'Referer': `${AUTH_LOGIN_URL}?service=${serviceParam}`,
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      /* 将 PNG 图片转为 base64 */
      const qrCodeImage = Buffer.from(imgResponse.data, 'binary').toString('base64');
      console.log(`[EduProxy] 步骤4完成：二维码图片大小 ${qrCodeImage.length} 字符 (base64)`);

      return {
        qrCodeImage,
        loginUrl: `${AUTH_LOGIN_URL}?service=${serviceParam}`,
      };
    } catch (error) {
      console.error('[EduProxy] 获取登录二维码失败:', error.message);
      console.error('[EduProxy] 错误堆栈:', error.stack);
      throw new Error(`获取登录二维码失败: ${error.message}`);
    }
  }

  /**
   * 检查登录状态（单次轮询）
   * 返回: { loggedIn: boolean, message?: string }
   */
  async checkLoginStatus() {
    if (this.loggedIn) {
      return true;
    }
    return false;
  }

  /**
   * 等待用户扫码登录
   *
   * 流程：
   * 1. 轮询 /authserver/qrCode/status?uuid=xxx
   * 2. 状态为 "1" 时，POST /authserver/login 提交登录
   * 3. 跟随 302 重定向链，收集最终 cookie
   * 4. 构建 axios 实例，获取学生信息
   */
  async waitForLogin(timeout = LOGIN_TIMEOUT) {
    if (this.loggedIn) {
      return { success: true, cookies: this._cookieList() };
    }

    if (!this.qrUuid || !this.ltTicket) {
      return { success: false, message: '二维码未初始化，请先获取二维码' };
    }

    const serviceParam = encodeURIComponent(SSO_SERVICE_URL);
    const startTime = Date.now();
    console.log(`[EduProxy] 开始轮询扫码状态，超时: ${timeout}ms...`);

    try {
      /* 轮询扫码状态 */
      while (Date.now() - startTime < timeout) {
        try {
          const statusResponse = await axios.get(QR_CODE_STATUS_URL, {
            params: { ts: Date.now(), uuid: this.qrUuid },
            proxy: false,
            ...(PROXY_AGENT ? { httpsAgent: PROXY_AGENT } : {}),
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': '*/*',
              'Cookie': this._cookieString(),
              'Referer': `${AUTH_LOGIN_URL}?service=${serviceParam}`,
              'X-Requested-With': 'XMLHttpRequest',
            },
            timeout: 5000,
          });

          const status = String(statusResponse.data).trim();
          console.log(`[EduProxy] 扫码状态: ${status} (${new Date().toISOString()})`);

          if (status === '1') {
            /* 用户已确认登录，提交登录表单 */
            console.log('[EduProxy] 用户已确认登录，提交登录表单...');
            await this._submitLoginForm(serviceParam);
            break;
          } else if (status === '2') {
            /* 已扫描，等待确认 */
            console.log('[EduProxy] 二维码已扫描，等待用户确认...');
          } else if (status === '3') {
            /* 二维码已失效 */
            return { success: false, message: '二维码已失效，请刷新重新获取' };
          }
          /* status === '0' 或其他：继续等待 */
        } catch (pollErr) {
          console.warn('[EduProxy] 轮询请求失败:', pollErr.message);
        }

        await this._delay(QR_POLL_INTERVAL);
      }

      /* 检查是否超时 */
      if (!this.loggedIn) {
        return { success: false, message: '等待登录超时，请重新扫码' };
      }

      return { success: true, cookies: this._cookieList() };
    } catch (error) {
      console.error('[EduProxy] 等待登录失败:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * 提交二维码登录表单并跟随重定向链
   */
  async _submitLoginForm(serviceParam) {
    try {
      /*
       * POST 表单到 authserver（模拟 $("#qrLoginForm").submit()）
       * 使用从 HTML 中提取的完整表单字段和 action URL
       *
       * 表单字段包括：lt, uuid, dllt, execution, _eventId, rmShown
       * action URL 包含 jsessionid: /authserver/login;jsessionid=xxx?service=...
       */
      const formUrl = this.loginFormAction || `${AUTH_LOGIN_URL}?service=${serviceParam}`;
      const formFields = this.loginFormFields || {
        lt: this.ltTicket,
        dllt: 'qrLogin',
        uuid: this.qrUuid,
      };

      console.log(`[EduProxy] 提交登录表单到: ${formUrl.substring(0, 100)}...`);
      console.log(`[EduProxy] 表单字段: ${JSON.stringify(formFields)}`);

      const loginResponse = await axios.post(
        formUrl,
        new URLSearchParams(formFields).toString(),
        this._cookieCaptureConfig({
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': `${AUTH_LOGIN_URL}?service=${serviceParam}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': AUTH_BASE_URL,
        })
      );

      this._mergeCookies(loginResponse);

      /* 检查最终 URL 是否到达教务系统 */
      const finalUrl = loginResponse.request?.res?.responseUrl || loginResponse.config?.url || '';
      console.log(`[EduProxy] 登录重定向完成，最终 URL: ${finalUrl}`);

      if (finalUrl.includes(EDU_HOST)) {
        console.log('[EduProxy] 已成功重定向回教务系统');
      } else if (finalUrl.includes('authserver')) {
        /* 如果还在 authserver，说明登录被拒绝 */
        console.error('[EduProxy] 登录被拒绝，仍在认证服务器');
        throw new Error('登录被拒绝，请检查二维码是否有效或重试');
      } else {
        console.warn('[EduProxy] 最终 URL 未到达教务系统，但继续尝试...');
      }

      /* 验证 cookie 数量 - 如果只有 2 个（SSO cookie），说明没有获得教务系统 session */
      const cookieCount = Object.keys(this.cookieJar).length;
      if (cookieCount <= 2) {
        console.warn(`[EduProxy] cookie 数量异常 (${cookieCount} 个)，可能登录未成功`);
      }

      this.loggedIn = true;
      this.cookies = this._cookieList();
      console.log(`[EduProxy] 登录完成！共收集 ${cookieCount} 个 cookies`);

      /* 构建 axios 实例 */
      this._buildAxiosInstance();

      /* 获取学生 ID 和当前学期 ID */
      await this._fetchStudentInfo();

    } catch (error) {
      console.error('[EduProxy] 提交登录表单失败:', error.message);
      throw new Error(`登录提交失败: ${error.message}`);
    }
  }

  // ==================== Cookie / Axios 工具 ====================

  /**
   * 构建 axios 实例（用于教务系统 API 调用）
   */
  _buildAxiosInstance() {
    const config = {
      baseURL: EDU_BASE_URL,
      timeout: 15000,
      proxy: false, // 禁用 axios 内置 proxy
      headers: {
        'Cookie': this._cookieString(),
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/plain, */*',
        'Referer': `${EDU_BASE_URL}/student/home`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    };
    if (PROXY_AGENT) {
      config.httpsAgent = PROXY_AGENT;
    }
    this.axiosInstance = axios.create(config);

    /* 响应拦截器：检测登录过期 */
    this.axiosInstance.interceptors.response.use(
      res => res,
      err => {
        if (err.response && (err.response.status === 302 || err.response.status === 401)) {
          console.log('[EduProxy] API 请求返回未授权，标记为未登录');
          this.loggedIn = false;
        }
        return Promise.reject(err);
      }
    );

    console.log(`[EduProxy] axios 实例已创建，携带 ${Object.keys(this.cookieJar).length} 个 cookies`);
  }

  // ==================== 获取学生信息（API） ====================

  /**
   * 登录后获取 studentId 和当前 semesterId
   */
  async _fetchStudentInfo() {
    try {
      console.log('[EduProxy] 正在获取学生信息...');

      /*
       * 方法0：从首页 HTML 中提取学生信息和学期信息
       * 首页通常包含当前学期信息和学生基本信息
       */
      try {
        const homeRes = await this.axiosInstance.get('/student/home');
        const homeHtml = homeRes.data || '';
        const $ = require('cheerio').load(homeHtml);

        /* 尝试从页面脚本中提取 studentId */
        const scripts = $('script').text();
        const idMatch = scripts.match(/studentId['":\s]+(\d+)/);
        if (idMatch) this.studentId = parseInt(idMatch[1]);

        const semMatch = scripts.match(/semesterId['":\s]+(\d+)/);
        if (semMatch) this.semesterId = parseInt(semMatch[1]);

        /* 尝试从页面链接中提取 semesterId */
        if (!this.semesterId) {
          const semLinkMatch = homeHtml.match(/semester\/(\d+)/);
          if (semLinkMatch) this.semesterId = parseInt(semLinkMatch[1]);
        }

        console.log(`[EduProxy] 首页提取: studentId=${this.studentId}, semesterId=${this.semesterId}`);
      } catch (e) {
        console.warn('[EduProxy] 从首页获取学生信息失败:', e.message);
      }

      /* 方法1：从课表 API 获取参数 */
      if (!this.studentId || !this.semesterId) {
        try {
          const res = await this.axiosInstance.get('/student/for-std/course-table/get-data', {
            params: { semesterId: this.semesterId || '' },
          });
          const data = res.data;
          if (data && data.id && !this.studentId) {
            this.studentId = data.id;
          }
          if (data && data.semester && data.semester.id && !this.semesterId) {
            this.semesterId = data.semester.id;
            this.semesterName = data.semester.nameZh || '';
          }
          console.log(`[EduProxy] 课表API提取: studentId=${this.studentId}, semesterId=${this.semesterId}`);
        } catch (e) {
          console.warn('[EduProxy] 通过课表 API 获取学生信息失败:', e.message);
        }
      }

      /* 方法2：从课表页面重定向 URL 获取 semesterId */
      if (!this.semesterId) {
        try {
          const courseTableRes = await this.axiosInstance.get('/student/for-std/course-table', {
            maxRedirects: 5,
          });
          const redirectUrl = courseTableRes.request?.res?.responseUrl || '';
          const semMatch = redirectUrl.match(/semester\/(\d+)/);
          if (semMatch) {
            this.semesterId = parseInt(semMatch[1]);
          }
        } catch (e) {
          /* 忽略 */
        }
      }

      /* 方法3：通过成绩页面重定向获取 studentId */
      if (!this.studentId) {
        try {
          const gradeRes = await this.axiosInstance.get('/student/for-std/grade/sheet', {
            maxRedirects: 5,
          });
          const gradeUrl = gradeRes.request?.res?.responseUrl || '';
          const gradeIdMatch = gradeUrl.match(/info\/(\d+)/);
          if (gradeIdMatch) {
            this.studentId = parseInt(gradeIdMatch[1]);
          }
        } catch (e) {
          console.warn('[EduProxy] 通过成绩 API 获取 studentId 失败:', e.message);
        }
      }

      console.log(`[EduProxy] 学生信息获取完成: studentId=${this.studentId}, semesterId=${this.semesterId}`);

      if (!this.studentId) {
        console.warn('[EduProxy] 未能自动获取 studentId，将在后续 API 调用中尝试获取');
      }
    } catch (error) {
      console.error('[EduProxy] 获取学生信息失败:', error.message);
    }
  }

  // ==================== 课表查询（API） ====================

  async getSchedule() {
    this._ensureApiReady();

    try {
      console.log('[EduProxy] 正在通过 API 获取课表...');

      const params = {};
      if (this.semesterId) params.semesterId = this.semesterId;

      const res = await this.axiosInstance.get('/student/for-std/course-table/get-data', {
        params,
        timeout: 15000,
      });

      const data = res.data;
      if (!data) {
        throw new Error('课表 API 返回空数据');
      }

      /* 从响应中更新 studentId 和 semesterId */
      if (data.id && !this.studentId) {
        this.studentId = data.id;
      }
      if (data.semester && data.semester.id && !this.semesterId) {
        this.semesterId = data.semester.id;
        this.semesterName = data.semester.nameZh || '';
      }

      /* 解析课表数据 */
      const scheduleData = this._parseScheduleApiData(data);

      /* 获取 MOOC 课程信息 */
      let moocCourses = [];
      try {
        moocCourses = await this._fetchMoocCourses();
      } catch (err) {
        console.warn('[EduProxy] MOOC 信息获取失败:', err.message);
      }

      const now = new Date();
      let dayOfWeek = now.getDay();
      dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
      const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

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
   * 解析课表 API 返回的 JSON 数据
   */
  _parseScheduleApiData(data) {
    const scheduleData = {};
    for (let d = 0; d < 7; d++) {
      scheduleData[d] = [];
    }

    const courseUnits = data.courseUnits || data.studentCourseUnits || [];
    if (courseUnits.length === 0) {
      console.warn('[EduProxy] courseUnits 为空，尝试其他数据字段...');
    }

    const courseCodeSet = {};

    for (const unit of courseUnits) {
      try {
        const lesson = unit.lesson || {};
        const time = unit.timeArrangement || unit.time || {};
        const room = unit.room || {};
        const teacher = unit.teacher || {};
        const building = room.building || room.campus || {};

        const nameZh = lesson.nameZh || '';
        const codeObj = lesson.code || {};
        const code = codeObj.code || '';

        const lessonKind = lesson.lessonKind || {};
        const kindName = lessonKind.nameZh || '';
        const isElective = kindName.includes('选') || nameZh.includes('（选）');
        const type = isElective ? '选修' : '必修';

        const weekDay = time.weekDay || 0;
        const startSlot = time.startSlot !== undefined ? time.startSlot : 0;
        const endSlot = time.endSlot !== undefined ? time.endSlot : startSlot;
        const weeks = time.weeks || unit.suggestScheduleWeeks || [];

        let weeksStr = '';
        if (weeks.length > 0) {
          const sortedWeeks = [...weeks].sort((a, b) => a - b);
          if (sortedWeeks.length === 1) {
            weeksStr = `${sortedWeeks[0]}周`;
          } else {
            weeksStr = `${sortedWeeks[0]}~${sortedWeeks[sortedWeeks.length - 1]}周`;
          }
        }

        const timeStr = `${startSlot + 1}-${endSlot + 1}节`;

        const buildingName = building.nameZh || '';
        const roomName = room.nameZh || room.name || '';
        const location = buildingName && roomName ? `${buildingName} ${roomName}` : roomName;

        const teacherName = teacher.nameZh || teacher.teacherAssignmentString || '';

        const stdCount = unit.stdCount || 0;
        const limitCount = unit.limitCount || 0;
        const enrollment = stdCount > 0 || limitCount > 0 ? `${stdCount}/${limitCount}` : '';

        const dayIndex = weekDay;
        const dedupeKey = code ? `${dayIndex}-${code}` : `${dayIndex}-${nameZh}-${timeStr}`;
        if (courseCodeSet[dedupeKey]) continue;
        courseCodeSet[dedupeKey] = true;

        if (!nameZh) continue;

        const course = {
          name: nameZh.replace(/^（选）/, '').replace(/^\(选\)/, ''),
          fullName: nameZh,
          code,
          teacher: teacherName,
          location,
          time: timeStr,
          slot: startSlot,
          endSlot,
          day: dayIndex,
          weeks: weeksStr,
          type,
          enrollment,
          color: 0,
        };

        const arrayIndex = dayIndex - 1;
        if (arrayIndex >= 0 && arrayIndex < 7) {
          scheduleData[arrayIndex].push(course);
        }
      } catch (err) {
        console.warn('[EduProxy] 解析课程单元失败:', err.message);
      }
    }

    return scheduleData;
  }

  /**
   * 获取 MOOC 课程信息
   */
  async _fetchMoocCourses() {
    try {
      const params = {};
      if (this.semesterId) params.semesterId = this.semesterId;

      const res = await this.axiosInstance.get('/student/for-std/course-table/get-all-data', {
        params,
        timeout: 10000,
      });

      const data = res.data;
      if (!data) return [];

      const allUnits = data.courseUnits || data.studentCourseUnits || [];
      const moocCourses = [];
      const seen = new Set();

      for (const unit of allUnits) {
        try {
          const lesson = unit.lesson || {};
          const nameZh = lesson.nameZh || '';
          const lessonKind = lesson.lessonKind || {};
          const kindName = lessonKind.nameZh || '';
          const virtualRoom = unit.virtualRoom || {};
          const remark = unit.remark || lesson.remark || '';

          const isMooc = nameZh.includes('MOOC') ||
                         kindName.includes('MOOC') ||
                         kindName.includes('mooc') ||
                         (virtualRoom && virtualRoom.nameZh);

          if (!isMooc) continue;
          if (seen.has(nameZh)) continue;
          seen.add(nameZh);

          let courseName = nameZh.replace(/^（选）/, '').replace(/（MOOC）$/i, '').trim();
          if (!courseName) continue;

          let platform = { name: '其他平台', url: '' };
          const fullText = nameZh + ' ' + remark;
          if (fullText.includes('学堂在线') || fullText.includes('雨课堂')) {
            platform = { name: '雨课堂', url: 'https://suibe.yuketang.cn/' };
          } else if (fullText.includes('超星尔雅') || fullText.includes('超星')) {
            platform = { name: '学习通（超星尔雅）', url: 'https://i.chaoxing.com' };
          } else if (fullText.includes('智慧树')) {
            platform = { name: '智慧树', url: 'https://www.zhihuishu.com/' };
          }

          let remarkUrl = '';
          const urlMatch = fullText.match(/(https?:\/\/[^\s"'<>)]+)/);
          if (urlMatch) remarkUrl = urlMatch[1];

          moocCourses.push({
            name: courseName,
            platform: platform.name,
            platformUrl: platform.url,
            remarkUrl,
          });
        } catch (err) {
          console.warn('[EduProxy] 解析 MOOC 课程失败:', err.message);
        }
      }

      console.log(`[EduProxy] MOOC课程提取完成，发现 ${moocCourses.length} 门`);
      return moocCourses;
    } catch (err) {
      console.warn('[EduProxy] 获取全部课程数据失败:', err.message);
      return [];
    }
  }

  // ==================== 成绩查询（API） ====================

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
    this._ensureApiReady();

    try {
      console.log('[EduProxy] 正在通过 API 获取成绩...');

      if (!this.studentId) {
        console.log('[EduProxy] studentId 未知，尝试获取...');
        await this._fetchStudentInfo();
      }

      if (!this.studentId) {
        throw new Error('无法获取学生ID，请重新登录');
      }

      const res = await this.axiosInstance.get(
        `/student/for-std/grade/sheet/info/${this.studentId}`,
        {
          params: this.semesterId ? { semester: this.semesterId } : {},
          timeout: 15000,
        }
      );

      const data = res.data;
      if (!data) {
        throw new Error('成绩 API 返回空数据');
      }

      const result = this._parseGradesApiData(data);

      console.log(`[EduProxy] 成绩获取完成，共 ${result.grades.length} 门课程，GPA: ${result.gpa}`);
      return result;
    } catch (error) {
      console.error('[EduProxy] 获取成绩失败:', error.message);
      throw new Error(`获取成绩失败: ${error.message}`);
    }
  }

  /**
   * 解析成绩 API 返回的 JSON 数据
   */
  _parseGradesApiData(data) {
    const grades = [];
    let totalCredits = 0;
    let totalGpaPoints = 0;
    let gpaCreditSum = 0;

    const semesters = data.semesterId2studentGrades || data.semesters || {};

    for (const [semId, gradeList] of Object.entries(semesters)) {
      if (!Array.isArray(gradeList)) continue;

      for (const item of gradeList) {
        try {
          const courseName = item.courseName || '';
          if (!courseName) continue;

          const credit = parseFloat(item.credits) || 0;

          const courseType = item.courseType?.nameZh || item.courseProperty?.nameZh || '';
          const isRequired = courseType.includes('必修');
          const isElective = courseType.includes('选修');
          let type = '必修';
          if (isElective && !isRequired) type = '选修';

          const semesterName = item.semesterName || '';
          let semester = '';
          const semMatch = semesterName.match(/(\d{4}-\d{4})学年\s+(第[一二三四五六七八九十]+学期)/);
          if (semMatch) {
            const semNumMap = { '一': '1', '二': '2', '三': '3', '四': '4' };
            const num = semMatch[2].replace('第', '').replace('学期', '');
            semester = `${semMatch[1]}-${semNumMap[num] || num}`;
          } else {
            semester = semId;
          }

          const score = item.score;
          const gaGrade = item.gaGrade?.nameZh || '';
          const gp = item.gp || 0;

          const isScoreText = !isNaN(score) && score !== null;
          const isGradeLevelText = !isScoreText && gaGrade;

          let displayScore;
          let gpaScore;

          if (isScoreText) {
            displayScore = score;
            gpaScore = score;
          } else if (isGradeLevelText) {
            const gradeScoreMap = {
              '优秀': 90, '良好': 85, '中等': 78,
              '及格': 68, '合格': 82, '不合格': 50, '不及格': 50,
            };
            displayScore = gaGrade;
            gpaScore = gradeScoreMap[gaGrade] || 0;
          } else {
            displayScore = score || gaGrade || '';
            gpaScore = 0;
          }

          const calculatedGpaPoint = this._scoreToGpaPoint(gpaScore);

          grades.push({
            courseName,
            credit,
            score: typeof displayScore === 'number' ? displayScore : displayScore,
            scoreNum: gpaScore,
            gpaPoint: calculatedGpaPoint,
            pageGpaPoint: gp,
            finalScore: item.gradeDetail?.finalScore || '',
            grade: this._scoreToGradeText(gpaScore),
            semester,
            type,
          });

          totalCredits += credit;
          if (gpaScore >= 60) {
            totalGpaPoints += calculatedGpaPoint * credit;
            gpaCreditSum += credit;
          }
        } catch (err) {
          console.warn('[EduProxy] 解析成绩条目失败:', err.message);
        }
      }
    }

    const gpa = gpaCreditSum > 0 ? Math.round((totalGpaPoints / gpaCreditSum) * 100) / 100 : 0;

    return {
      gpa,
      totalCredits,
      courseCount: grades.length,
      grades,
    };
  }

  // ==================== 辅助方法 ====================

  _ensureApiReady() {
    if (!this.loggedIn) {
      throw new Error('未登录教务系统，请先完成扫码登录');
    }
    if (!this.axiosInstance) {
      throw new Error('API 客户端未初始化，请重新登录');
    }
  }

  /**
   * 验证会话是否仍然有效
   */
  async validateSession() {
    if (!this.axiosInstance) return false;
    try {
      await this.axiosInstance.get('/student/params/get-schoolName', { timeout: 5000 });
      return true;
    } catch (e) {
      console.log('[EduProxy] 会话验证失败:', e.message);
      this.loggedIn = false;
      return false;
    }
  }

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EduProxy;
