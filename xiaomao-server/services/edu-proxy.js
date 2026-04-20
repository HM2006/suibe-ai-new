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
    this.execution = null;       // CAS 表单隐藏字段
    this.eventId = 'submit';     // CAS 表单隐藏字段
    /* API 相关参数 - 登录后自动获取 */
    this.studentId = null;
    this.personId = null;
    this.dataId = null;
    this.bizTypeId = null;
    this.semesterId = null;
    this.semesterName = '';
    this.allSemesterIds = [];
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
    this.execution = null;
    this.eventId = 'submit';
    this.studentId = null;
    this.personId = null;
    this.dataId = null;
    this.bizTypeId = null;
    this.semesterId = null;
    this.semesterName = '';
    this.allSemesterIds = [];
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

      /* 从 HTML 中提取 lt ticket */
      const html = authResponse.data || '';
      const ltMatch = html.match(/name="lt"\s+value="([^"]+)"/);
      if (!ltMatch) {
        throw new Error('无法从认证页面提取 lt ticket，页面结构可能已变更');
      }
      this.ltTicket = ltMatch[1];
      console.log(`[EduProxy] lt ticket: ${this.ltTicket}`);

      /* 从 HTML 中提取 execution 字段（CAS 必需） */
      const execMatch = html.match(/name="execution"\s+value="([^"]+)"/);
      if (execMatch) {
        this.execution = execMatch[1];
        console.log(`[EduProxy] execution: ${this.execution}`);
      } else {
        console.warn('[EduProxy] 未找到 execution 字段，可能影响登录');
      }

      /* 从 HTML 中提取 _eventId 字段 */
      const eventMatch = html.match(/name="_eventId"\s+value="([^"]+)"/);
      if (eventMatch) {
        this.eventId = eventMatch[1];
      }

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
    if (this.axiosInstance) {
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
   * 提交二维码登录表单并手动跟随重定向链
   *
   * 关键修复：axios 自动跟随重定向时，跨域（authserver → nbkjw）的
   * set-cookie 可能丢失。改为手动逐步跟随 302，确保每一步都正确
   * 收集 cookie 并传递到下一次请求。
   */
  async _submitLoginForm(serviceParam) {
    try {
      /*
       * POST /authserver/login (maxRedirects: 0，手动控制重定向)
       */
      console.log('[EduProxy] 提交登录表单（手动重定向模式）...');

      /* 构建表单数据，包含所有必需的隐藏字段 */
      const formData = new URLSearchParams({
        lt: this.ltTicket,
        dllt: 'qrLogin',
        uuid: this.qrUuid,
      });
      /* 添加 CAS 必需的隐藏字段 */
      if (this.execution) {
        formData.append('execution', this.execution);
      }
      formData.append('_eventId', this.eventId || 'submit');

      console.log(`[EduProxy] 表单数据: lt=${this.ltTicket?.substring(0, 20)}..., uuid=${this.qrUuid}, execution=${this.execution}`);

      let response = await axios.post(
        `${AUTH_LOGIN_URL}?service=${serviceParam}`,
        formData.toString(),
        {
          headers: {
            'User-Agent': USER_AGENT,
            'Cookie': this._cookieString(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': `${AUTH_LOGIN_URL}?service=${serviceParam}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          maxRedirects: 0,
          validateStatus: (status) => status < 400,
          proxy: false,
          ...(PROXY_AGENT ? { httpsAgent: PROXY_AGENT } : {}),
          timeout: 15000,
        }
      );

      this._mergeCookies(response);
      console.log(`[EduProxy] POST 登录响应状态: ${response.status}`);

      /*
       * 手动跟随重定向链（最多 15 次）
       */
      const MAX_REDIRECTS = 15;
      let redirectCount = 0;
      let currentUrl = response.headers?.location || '';

      while (currentUrl && redirectCount < MAX_REDIRECTS) {
        redirectCount++;
        /* 处理相对路径 */
        if (currentUrl.startsWith('/')) {
          const parsedUrl = new URL(response.config?.url || AUTH_LOGIN_URL);
          currentUrl = `${parsedUrl.origin}${currentUrl}`;
        }

        console.log(`[EduProxy] 重定向 ${redirectCount}: ${currentUrl}`);

        response = await axios.get(currentUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Cookie': this._cookieString(),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': currentUrl,
          },
          maxRedirects: 0,
          validateStatus: (status) => status < 400,
          proxy: false,
          ...(PROXY_AGENT ? { httpsAgent: PROXY_AGENT } : {}),
          timeout: 15000,
        });

        this._mergeCookies(response);
        console.log(`[EduProxy] 重定向 ${redirectCount} 响应状态: ${response.status}`);

        currentUrl = response.headers?.location || '';
      }

      console.log(`[EduProxy] 重定向链完成（共 ${redirectCount} 次），最终 URL: ${response.config?.url || ''}`);
      console.log(`[EduProxy] 最终 cookies: ${JSON.stringify(this.cookieJar, null, 2)}`);

      /* 验证是否真正到达了教务系统 */
      const finalUrl = response.config?.url || '';
      const reachedEdu = finalUrl.includes(EDU_HOST);

      if (!reachedEdu) {
        /* 检查响应体是否包含教务系统特征 */
        const bodyStr = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        if (bodyStr.includes('登入页面') || bodyStr.includes('login')) {
          throw new Error('登录未成功：未到达教务系统，仍停留在登录页面。请重试。');
        }
      }

      console.log(`[EduProxy] ${reachedEdu ? '已成功' : '可能已'}到达教务系统`);

      this.loggedIn = true;
      this.cookies = this._cookieList();
      console.log(`[EduProxy] 登录成功！共收集 ${Object.keys(this.cookieJar).length} 个 cookies`);

      /* 构建 axios 实例 */
      this._buildAxiosInstance();

      /* 获取学生 ID 和当前学期 ID */
      await this._fetchStudentInfo();

    } catch (error) {
      console.error('[EduProxy] 提交登录表单失败:', error.message);
      this.loggedIn = false;
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
   *
   * 策略（合并两版优点）：
   * 步骤1：从成绩页面重定向 URL 获取 studentId
   * 步骤2：从课表页面 HTML 提取 semesterId（新版逻辑，更可靠）
   * 步骤3：从成绩 API 获取 semesterId 并验证课表可用性（旧版逻辑，兜底）
   */
  async _fetchStudentInfo() {
    try {
      console.log('[EduProxy] 正在获取学生信息...');

      /* 步骤1：从成绩页面重定向 URL 获取 studentId
       * URL 格式: /student/for-std/grade/sheet/semester-index/{studentId} */
      try {
        console.log('[EduProxy] 步骤1: 从成绩页面获取 studentId ...');
        const gradeRes = await this.axiosInstance.get('/student/for-std/grade/sheet', {
          maxRedirects: 5,
        });
        const gradeUrl = gradeRes.request?.res?.responseUrl || gradeRes.config?.url || '';
        console.log('[EduProxy] 步骤1 最终URL:', gradeUrl);
        const idMatch = gradeUrl.match(/semester-index\/(\d+)/) || gradeUrl.match(/info\/(\d+)/);
        if (idMatch) {
          this.studentId = parseInt(idMatch[1]);
          console.log('[EduProxy] 步骤1 成功获取 studentId:', this.studentId);
        }
      } catch (e) {
        console.warn('[EduProxy] 步骤1 失败:', e.message);
      }

      /* 步骤2：从课表页面 HTML 提取 personId、dataId、bizTypeId 和当前学期信息
       * 课表页面的 JS 中包含: var personId = xxx; var currentSemester = {id: xxx, ...};
       * 课表 API (print-data) 需要 semesterId
       * 课表 API (get-data) 需要 dataId + bizTypeId */
      try {
        console.log('[EduProxy] 步骤2: 从课表页面提取 personId、dataId、bizTypeId 和学期信息 ...');
        const ctRes = await this.axiosInstance.get('/student/for-std/course-table', {
          maxRedirects: 5,
          timeout: 15000,
        });
        const ctHtml = typeof ctRes.data === 'string' ? ctRes.data : '';

        /* 打印 HTML 中的关键变量（调试） */
        const semesterVars = ctHtml.match(/var\s+\w*[Ss]emester\w*\s*=\s*[^;]+;/g) || [];
        console.log('[EduProxy] 课表页面 semester 相关变量:', semesterVars.slice(0, 10));

        /* 提取 personId */
        const personIdMatch = ctHtml.match(/var\s+personId\s*=\s*(\d+)/);
        if (personIdMatch) {
          this.personId = parseInt(personIdMatch[1]);
          console.log('[EduProxy] 步骤2 成功获取 personId:', this.personId);
        }

        /* 提取 dataId（课表数据 ID，通常等于 personId） */
        const dataIdMatch = ctHtml.match(/var\s+dataId\s*=\s*(\d+)/);
        if (dataIdMatch) {
          this.dataId = parseInt(dataIdMatch[1]);
          console.log('[EduProxy] 步骤2 成功获取 dataId:', this.dataId);
        } else if (this.personId) {
          /* dataId 通常等于 personId，兜底使用 */
          this.dataId = this.personId;
          console.log('[EduProxy] 步骤2 dataId 未找到，使用 personId 作为 dataId:', this.dataId);
        }

        /* 提取 bizTypeId（业务类型 ID，学生端通常为 2） */
          const bizTypeIdMatch = ctHtml.match(/var\s+bizTypeId\s*=\s*(\d+)/);
          if (bizTypeIdMatch) {
            this.bizTypeId = parseInt(bizTypeIdMatch[1]);
            console.log('[EduProxy] 步骤2 成功获取 bizTypeId:', this.bizTypeId);
          } else {
            /* 学生端 bizTypeId 固定为 2 */
            this.bizTypeId = 2;
            console.log('[EduProxy] 步骤2 bizTypeId 未找到，默认使用 2（学生端）');
          }

        /* 提取 currentSemester.id
         * currentSemester 是一个复杂嵌套对象，直接匹配 'id' 容易命中嵌套字段（如 calendarAssoc.id=1）
         * 可靠方案：从 semesters JSON 数组中提取第一个学期 id（即当前学期）
         */
        const semestersJsonMatch = ctHtml.match(/var\s+semesters\s*=\s*JSON\.parse\(\s*'([\s\S]*?)'\s*\)/);
        if (semestersJsonMatch) {
          try {
            const semestersArr = JSON.parse(semestersJsonMatch[1]);
            if (Array.isArray(semestersArr) && semestersArr.length > 0 && semestersArr[0].id) {
              this.semesterId = semestersArr[0].id;
              console.log('[EduProxy] 步骤2 从 semesters 数组获取当前学期 id:', this.semesterId, semestersArr[0].nameZh);
            }
          } catch (e) {
            console.warn('[EduProxy] 解析 semesters JSON 失败:', e.message);
          }
        }

        /* 备用方案：从 currentSemester 变量块中查找顶层的 id（跳过嵌套对象的 id） */
        if (!this.semesterId) {
          const semDeclIdx = ctHtml.indexOf('var currentSemester');
          if (semDeclIdx !== -1) {
            const semDeclEnd = ctHtml.indexOf(';', semDeclIdx);
            const semDeclBlock = ctHtml.substring(semDeclIdx, semDeclEnd > 0 ? Math.min(semDeclEnd, semDeclIdx + 5000) : semDeclIdx + 5000);
            const idMatches = [...semDeclBlock.matchAll(/'id'\s*:\s*(\d+)/g)];
            for (const m of idMatches) {
              const val = parseInt(m[1]);
              if (val > 10) {
                this.semesterId = val;
                console.log('[EduProxy] 步骤2 从 currentSemester 块中获取 id:', this.semesterId);
                break;
              }
            }
          }
        }

        /* 提取 semesterId 变量 */
        if (!this.semesterId) {
          const semIdMatch = ctHtml.match(/var\s+semesterId\s*=\s*(\d+)/);
          if (semIdMatch) {
            this.semesterId = parseInt(semIdMatch[1]);
            console.log('[EduProxy] 步骤2 从 semesterId 变量获取:', this.semesterId);
          }
        }

        /* 提取所有学期 ID 列表 */
        const allSemIds = ctHtml.match(/id\s*:\s*(\d+)\s*,\s*nameZh/g) || [];
        if (allSemIds.length > 0) {
          this.allSemesterIds = allSemIds.map(m => parseInt(m.match(/id\s*:\s*(\d+)/)[1]));
          console.log('[EduProxy] 步骤2 发现学期列表:', this.allSemesterIds);
        }
      } catch (e) {
        console.warn('[EduProxy] 步骤2 失败:', e.message);
      }

      /* 步骤3：通过成绩 API 获取所有 semesterId，并尝试验证课表可用性（旧版兜底逻辑）
       * 成绩 API 不需要 semesterId 参数，返回数据中包含各学期的 ID */
      if (this.studentId) {
        try {
          console.log('[EduProxy] 步骤3: 通过成绩 API 获取所有 semesterId ...');
          const res = await this.axiosInstance.get(
            `/student/for-std/grade/sheet/info/${this.studentId}`,
            { timeout: 15000 }
          );
          const data = res.data;
          if (data) {
            const semesters = data.semesterId2studentGrades || data.semesters || {};
            const semIds = Object.keys(semesters).map(s => parseInt(s));
            console.log('[EduProxy] 步骤3 发现的所有 semesterId:', semIds);

            if (semIds.length > 0) {
              /* 如果步骤2没有获取到 semesterId，使用成绩中最新的学期 */
              if (!this.semesterId) {
                this.semesterId = semIds[semIds.length - 1];
                console.log('[EduProxy] 步骤3 使用成绩最新 semesterId:', this.semesterId);
              }

              /* 验证当前 semesterId 是否能获取到课表数据 */
              if (this.semesterId) {
                try {
                  console.log('[EduProxy] 步骤3 验证 semesterId:', this.semesterId, '课表可用性...');
                  const courseRes = await this.axiosInstance.get(
                    `/student/for-std/course-table/semester/${this.semesterId}/print-data`,
                    { params: { semesterId: this.semesterId, hasExperiment: true }, timeout: 10000 }
                  );
                  if (courseRes.data && typeof courseRes.data === 'object') {
                    const hasData = (courseRes.data.studentTableVms && courseRes.data.studentTableVms.length > 0) ||
                                    (courseRes.data.courseUnits && courseRes.data.courseUnits.length > 0);
                    if (hasData) {
                      console.log('[EduProxy] 步骤3 课表验证成功，semesterId:', this.semesterId);
                    } else {
                      /* 当前 semesterId 无课表数据，尝试其他学期 */
                      console.log('[EduProxy] 步骤3 当前学期无课表，尝试其他学期...');
                      for (const semId of semIds.reverse()) {
                        try {
                          const altRes = await this.axiosInstance.get(
                            `/student/for-std/course-table/semester/${semId}/print-data`,
                            { params: { semesterId: semId, hasExperiment: true }, timeout: 10000 }
                          );
                          const altHasData = (altRes.data?.studentTableVms?.length > 0) ||
                                             (altRes.data?.courseUnits?.length > 0);
                          if (altHasData) {
                            this.semesterId = semId;
                            console.log('[EduProxy] 步骤3 找到可用课表 semesterId:', this.semesterId);
                            break;
                          }
                        } catch (courseErr) {
                          console.log('[EduProxy] 步骤3 semesterId', semId, '课表获取失败，继续尝试下一个');
                        }
                      }
                    }
                  }
                } catch (courseErr) {
                  console.warn('[EduProxy] 步骤3 课表验证失败:', courseErr.message);
                }
              }
            }
          }
        } catch (e) {
          console.warn('[EduProxy] 步骤3 失败:', e.message);
        }
      }

      console.log(`[EduProxy] 学生信息获取完成: studentId=${this.studentId}, personId=${this.personId}, semesterId=${this.semesterId}`);

      if (!this.studentId) {
        console.warn('[EduProxy] 未能自动获取 studentId');
      }
    } catch (error) {
      console.error('[EduProxy] 获取学生信息失败:', error.message);
    }
  }

  // ==================== 课表查询（API） ====================

  async getSchedule() {
    this._ensureApiReady();

    try {
      console.log('[EduProxy] 正在获取课表...');

      let data = null;

      /*
       * 方法1：使用正确的学生课表 API（print-data 接口）
       * 前端 JS 源码分析：学生端课表使用 /for-std/course-table/semester/{semesterId}/print-data
       * 参数：semesterId, hasExperiment
       * 返回：{ studentTableVms: [...], credits: ..., ... }
       */
      if (this.semesterId) {
        try {
          console.log(`[EduProxy] 方法1: 调用 print-data API, semesterId=${this.semesterId}`);
          const res = await this.axiosInstance.get(
            `/student/for-std/course-table/semester/${this.semesterId}/print-data`,
            {
              params: {
                semesterId: this.semesterId,
                hasExperiment: true,
              },
              timeout: 15000,
            }
          );
          data = res.data;
          /* 检查是否返回了 HTML 而不是 JSON */
          if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('登入页面'))) {
            console.log('[EduProxy] print-data API 返回 HTML，会话可能已失效');
            data = null;
          } else if (data) {
            console.log(`[EduProxy] print-data API 返回数据，keys: ${Object.keys(data).join(', ')}`);
          }
        } catch (apiErr) {
          console.log('[EduProxy] print-data API 调用失败:', apiErr.message);
          data = null;
        }
      }

      /*
       * 方法2：尝试 get-data API（带 dataId + bizTypeId 参数）
       * 部分场景下可能需要此接口
       */
      if (!data && this.semesterId) {
        try {
          console.log('[EduProxy] 方法2: 尝试 get-data API...');
          const params = { semesterId: this.semesterId };
          if (this.dataId) params.dataId = this.dataId;
          if (this.bizTypeId) params.bizTypeId = this.bizTypeId;

          const res = await this.axiosInstance.get('/student/for-std/course-table/get-data', {
            params,
            timeout: 15000,
          });
          data = res.data;
          if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
            console.log('[EduProxy] get-data API 返回 HTML');
            data = null;
          } else if (data) {
            console.log(`[EduProxy] get-data API 返回数据，keys: ${Object.keys(data).join(', ')}`);
          }
        } catch (apiErr) {
          console.log('[EduProxy] get-data API 调用失败:', apiErr.message);
          data = null;
        }
      }

      /* 方法3：从课表页面 HTML 解析（兜底方案） */
      if (!data) {
        console.log('[EduProxy] 方法3: 尝试从课表页面 HTML 解析课表数据...');
        const htmlRes = await this.axiosInstance.get('/student/for-std/course-table', {
          params: this.semesterId ? { semesterId: this.semesterId } : {},
          timeout: 15000,
        });
        const html = typeof htmlRes.data === 'string' ? htmlRes.data : '';

        /* 检查是否在登录页面 */
        if (html.includes('登入页面') || html.includes('login')) {
          throw new Error('课表页面返回登录页面，会话可能已失效');
        }

        /* 尝试从 HTML 中提取嵌入的 JSON 数据 */
        const jsonMatch = html.match(/var\s+courseTableData\s*=\s*(\{[\s\S]*?\});/) ||
                          html.match(/courseUnits\s*:\s*(\[[\s\S]*?\])/);
        if (jsonMatch) {
          try {
            data = JSON.parse(jsonMatch[1]);
            console.log('[EduProxy] 从 HTML 成功提取课表数据');
          } catch (e) {
            console.log('[EduProxy] JSON 解析失败:', e.message);
          }
        }

        /* 尝试从 __INITIAL_STATE__ 或类似变量提取 */
        if (!data) {
          const stateMatch = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/) ||
                             html.match(/window\.__DATA__\s*=\s*(\{[\s\S]*?\});/);
          if (stateMatch) {
            try {
              data = JSON.parse(stateMatch[1]);
              console.log('[EduProxy] 从 __DATA__ 成功提取课表数据');
            } catch (e) {}
          }
        }

        if (!data) {
          throw new Error('无法从课表页面解析课表数据，教务系统可能已更新');
        }
      }

      if (!data) {
        throw new Error('课表数据为空');
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
        moocCourses = await this._fetchMoocCourses(data);
      } catch (err) {
        console.warn('[EduProxy] MOOC 信息获取失败:', err.message);
      }

      const now = new Date();
      let dayOfWeek = now.getDay();
      dayOfWeek = dayOfWeek === 0 ? 7 : dayOfWeek;
      const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

      let totalCourses = 0;
      Object.values(scheduleData).forEach(courses => totalCourses += courses.length);

      /* 在同一会话中获取培养方案 */
      try {
        console.log('[EduProxy] 课表获取完成，开始获取培养方案...');
        const program = await this.getTrainingProgram();
        this._lastTrainingProgram = program;
        console.log('[EduProxy] 培养方案获取完成');
      } catch (err) {
        console.warn('[EduProxy] 培养方案获取失败:', err.message);
      }

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
      if (error.response) {
        console.error('[EduProxy] 课表错误响应状态:', error.response.status);
        console.error('[EduProxy] 课表错误响应体:', JSON.stringify(error.response.data)?.substring(0, 500));
      }
      throw new Error(`获取课表失败: ${error.message}`);
    }
  }

  /**
   * 解析课表 API 返回的 JSON 数据
   *
   * 支持两种数据结构：
   * 1. print-data API 返回: { studentTableVms: [{ activities: [...], ... }] }
   *    - activities 中每个元素是扁平结构: lessonName, weekday, startUnit, endUnit,
   *      room, building, campus, teachers: [{name:...}], weekIndexes, courseType 等
   * 2. get-data API 返回: { courseUnits: [...] } 或 { studentCourseUnits: [...] }
   *    - courseUnits 中每个元素是嵌套结构: lesson.nameZh, timeArrangement.weekDay,
   *      room.nameZh, teacher.nameZh 等
   */
  _parseScheduleApiData(data) {
    const scheduleData = {};
    for (let d = 0; d < 7; d++) {
      scheduleData[d] = [];
    }

    const courseCodeSet = {};

    /*
     * 从 studentTableVms（print-data API 返回）中提取 activities
     * studentTableVms 是一个数组，每个元素代表一个课表视图
     */
    let courseUnits = [];
    let isPrintDataFormat = false;

    if (data.studentTableVms && Array.isArray(data.studentTableVms)) {
      /* print-data API 返回结构: { studentTableVms: [{ activities: [...] }] } */
      console.log(`[EduProxy] 检测到 studentTableVms 结构，共 ${data.studentTableVms.length} 个视图`);
      isPrintDataFormat = true;
      for (const tableVm of data.studentTableVms) {
        if (tableVm.activities && Array.isArray(tableVm.activities)) {
          courseUnits = courseUnits.concat(tableVm.activities);
        }
      }
      /* 调试：打印第一条 activity 的所有字段名 */
      if (courseUnits.length > 0) {
        console.log(`[EduProxy] 第一条 activity 的字段:`, Object.keys(courseUnits[0]).join(', '));
        console.log(`[EduProxy] 第一条 activity 示例(教师相关):`, JSON.stringify({
          teachers: courseUnits[0].teachers,
          teacherName: courseUnits[0].teacherName,
          teacher: courseUnits[0].teacher,
          teacherAssignmentString: courseUnits[0].teacherAssignmentString,
        }));
      }
    }

    /* 兼容旧的 courseUnits 结构 */
    if (courseUnits.length === 0) {
      courseUnits = data.courseUnits || data.studentCourseUnits || [];
    }

    if (courseUnits.length === 0) {
      console.warn('[EduProxy] courseUnits/activities 为空，无法解析课表');
      console.warn('[EduProxy] 返回数据的 keys:', Object.keys(data));
    }

    for (const unit of courseUnits) {
      try {
        /*
         * 适配两种数据结构：
         * - print-data (扁平): unit.lessonName, unit.weekday, unit.startUnit 等
         * - get-data (嵌套): unit.lesson.nameZh, unit.timeArrangement.weekDay 等
         */
        let nameZh, code, type;
        let weekDay, startSlot, endSlot;
        let weeksArr, weeksStr;
        let location, teacherName;
        let stdCount, limitCount, enrollment;

        if (isPrintDataFormat) {
          /* === print-data API 扁平结构 ===
           * courseName: 课程名称（如"管理学"）
           * lessonName: 教学任务名称（可能包含班级信息，如"2024级人工智能1班;..."）
           * 优先使用 courseName，fallback 到 lessonName
           */
          nameZh = unit.courseName || unit.lessonName || '';
          code = unit.lessonCode || unit.courseCode || '';

          const courseType = unit.courseType || {};
          const courseTypeName = courseType.nameZh || '';
          const isElective = courseTypeName.includes('选') || nameZh.includes('（选）');
          type = isElective ? '选修' : '必修';

          weekDay = unit.weekday || 0;
          startSlot = (unit.startUnit || 1) - 1;  // 转为 0-based
          endSlot = (unit.endUnit || unit.startUnit || 1) - 1;

          /* 周次信息 */
          weeksArr = unit.weekIndexes || [];
          if (weeksArr.length > 0) {
            const sortedWeeks = [...weeksArr].sort((a, b) => a - b);
            if (sortedWeeks.length === 1) {
              weeksStr = `${sortedWeeks[0]}周`;
            } else {
              /* 检查是否连续 */
              const isConsecutive = sortedWeeks[sortedWeeks.length - 1] - sortedWeeks[0] === sortedWeeks.length - 1;
              if (isConsecutive) {
                weeksStr = `${sortedWeeks[0]}~${sortedWeeks[sortedWeeks.length - 1]}周`;
              } else {
                weeksStr = sortedWeeks.join(',');
              }
            }
          } else if (unit.weeksStr) {
            weeksStr = unit.weeksStr;
          }

          const timeStr = `${startSlot + 1}-${endSlot + 1}节`;

          /* 教室信息 */
          const campusName = unit.campus || '';
          const buildingName = unit.building || '';
          const roomName = unit.room || '';
          if (buildingName && roomName) {
            location = `${campusName} ${buildingName} ${roomName}`.trim();
          } else if (roomName) {
            location = `${campusName} ${roomName}`.trim();
          } else {
            location = campusName;
          }

          /* 教师信息 - 多字段兼容
           * 实际数据: teachers 是字符串数组，如 ["单泓睿(20230005,讲师（高校）)"]
           * 需要提取姓名部分（括号前的内容） */
          const teachers = unit.teachers || unit.teacherList || [];
          if (Array.isArray(teachers) && teachers.length > 0) {
            teacherName = teachers.map(t => {
              if (typeof t === 'string') {
                /* 字符串格式: "姓名(工号,职称)" → 提取姓名 */
                const parenIdx = t.indexOf('(');
                return parenIdx > 0 ? t.substring(0, parenIdx) : t;
              }
              return t.name || t.nameZh || t.teacherName || '';
            }).filter(Boolean).join(', ');
          } else if (typeof teachers === 'string') {
            teacherName = teachers;
          } else {
            /* 尝试其他可能的教师字段 */
            teacherName = unit.teacherName || unit.teacherAssignmentString ||
                          (unit.teacher && (unit.teacher.nameZh || unit.teacher.name)) || '';
          }

          stdCount = unit.stdCount || 0;
          limitCount = unit.limitCount || 0;
          enrollment = stdCount > 0 || limitCount > 0 ? `${stdCount}/${limitCount}` : '';
        } else {
          /* === get-data API 嵌套结构 === */
          const lesson = unit.lesson || {};
          const time = unit.timeArrangement || unit.time || {};
          const room = unit.room || {};
          const teacher = unit.teacher || {};
          const building = room.building || room.campus || {};

          nameZh = lesson.nameZh || '';
          const codeObj = lesson.code || {};
          code = codeObj.code || '';

          const lessonKind = lesson.lessonKind || {};
          const kindName = lessonKind.nameZh || '';
          const isElective = kindName.includes('选') || nameZh.includes('（选）');
          type = isElective ? '选修' : '必修';

          weekDay = time.weekDay || 0;
          startSlot = time.startSlot !== undefined ? time.startSlot : 0;
          endSlot = time.endSlot !== undefined ? time.endSlot : startSlot;
          weeksArr = time.weeks || unit.suggestScheduleWeeks || [];

          if (weeksArr.length > 0) {
            const sortedWeeks = [...weeksArr].sort((a, b) => a - b);
            if (sortedWeeks.length === 1) {
              weeksStr = `${sortedWeeks[0]}周`;
            } else {
              weeksStr = `${sortedWeeks[0]}~${sortedWeeks[sortedWeeks.length - 1]}周`;
            }
          }

          const timeStr = `${startSlot + 1}-${endSlot + 1}节`;

          const buildingName = building.nameZh || '';
          const roomName = room.nameZh || room.name || '';
          location = buildingName && roomName ? `${buildingName} ${roomName}` : roomName;

          teacherName = teacher.nameZh || teacher.name || teacher.teacherAssignmentString ||
                        (Array.isArray(teacher) ? teacher.map(t => t.nameZh || t.name || '').filter(Boolean).join(', ') : '');

          stdCount = unit.stdCount || 0;
          limitCount = unit.limitCount || 0;
          enrollment = stdCount > 0 || limitCount > 0 ? `${stdCount}/${limitCount}` : '';
        }

        const timeStr = `${startSlot + 1}-${endSlot + 1}节`;
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
          weeks: weeksStr || '',
          weekIndexes: weeksArr || [],  // 原始周次数组，前端用于按周过滤
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
   *
   * 策略：
   * 1. 先从 getSchedule 已获取的 print-data 数据中筛选
   * 2. 如果没找到 MOOC，再单独请求 get-data API（MOOC 只在此 API 中）
   */
  async _fetchMoocCourses(existingData) {
    try {
      if (!this.semesterId) return [];

      /* ===== 第一轮：从已有 print-data 数据中筛选 ===== */
      let allUnits = [];
      if (existingData) {
        if (existingData.studentTableVms) {
          for (const tableVm of existingData.studentTableVms) {
            if (tableVm.activities) allUnits = allUnits.concat(tableVm.activities);
          }
        }
        if (allUnits.length === 0) allUnits = existingData.courseUnits || [];
      }

      let moocCourses = this._filterMoocFromUnits(allUnits);
      if (moocCourses.length > 0) {
        console.log(`[EduProxy] MOOC: 从已有数据中找到 ${moocCourses.length} 门`);
        return moocCourses;
      }
      console.log(`[EduProxy] MOOC: 已有数据(${allUnits.length}条)中未找到MOOC，尝试 get-data API...`);

      /* ===== 第二轮：请求 get-data API（MOOC 只在此 API 中） ===== */
      if (this.dataId) {
        try {
          const params = { semesterId: this.semesterId, dataId: this.dataId };
          if (this.bizTypeId) params.bizTypeId = this.bizTypeId;
          console.log(`[EduProxy] MOOC: 请求 get-data, params:`, JSON.stringify(params));

          const res = await this.axiosInstance.get('/student/for-std/course-table/get-data', {
            params, timeout: 10000,
          });
          if (res.data) {
              /* get-data 响应结构: { lessons: [...], lessonIds: [...], ... }
               * 注意：没有 courseUnits 字段，课程在 lessons 数组中 */
              const getDataUnits = res.data.lessons || res.data.courseUnits || res.data.studentCourseUnits || [];
              console.log(`[EduProxy] MOOC: get-data 返回 ${getDataUnits.length} 条 lessons`);
              if (getDataUnits.length > 0) {
                /* 调试：打印第一条 lesson 的所有字段 */
                console.log(`[EduProxy]   第一条 lesson keys:`, Object.keys(getDataUnits[0]));
                console.log(`[EduProxy]   第一条 lesson 示例:`, JSON.stringify(getDataUnits[0]).substring(0, 800));
                /* 打印所有课程名称 */
                for (const unit of getDataUnits) {
                  const nameZh = unit.nameZh || unit.courseName || unit.lessonName || '';
                  const kindName = unit.lessonKind?.nameZh || unit.courseType?.nameZh || '';
                  console.log(`[EduProxy]   get-data课程: "${nameZh}" | 类型: "${kindName}"`);
                }
              moocCourses = this._filterMoocFromUnits(getDataUnits);
              if (moocCourses.length > 0) {
                console.log(`[EduProxy] MOOC: 从 get-data 中找到 ${moocCourses.length} 门`);
                return moocCourses;
              }
            }
          }
        } catch (err) {
          console.warn('[EduProxy] MOOC: get-data 失败:', err.message);
          if (err.response) {
            console.warn('[EduProxy] MOOC: get-data 响应状态:', err.response.status, '数据:', JSON.stringify(err.response.data)?.substring(0, 500));
          }
        }
      }

      console.log(`[EduProxy] MOOC课程提取完成，发现 0 门`);
      return [];
    } catch (err) {
      console.warn('[EduProxy] 获取 MOOC 数据失败:', err.message);
      return [];
    }
  }

  /**
   * 从课程单元列表中筛选 MOOC 课程
   * 兼容 print-data 扁平结构和 get-data 嵌套结构
   */
  _filterMoocFromUnits(allUnits) {
    const moocCourses = [];
    const seen = new Set();

    for (const unit of allUnits) {
      try {
        /* 兼容三种数据结构：
         * 1. print-data 扁平结构: unit.courseName, unit.courseType.nameZh (有 lessonName 字段)
         * 2. get-data lessons 结构: unit.course.nameZh, unit.lessonKind.nameZh (有 course 字段)
         * 3. get-data courseUnits 嵌套结构: unit.lesson.nameZh, unit.lesson.lessonKind.nameZh */
        const isFlat = !!unit.lessonName;
        const isLesson = !isFlat && !!unit.course && !unit.lesson;
        const nameZh = isFlat
          ? (unit.courseName || unit.lessonName || '')
          : isLesson
            ? (unit.course?.nameZh || '')
            : (unit.lesson?.nameZh || '');
        const kindName = isFlat
          ? (unit.courseType?.nameZh || '')
          : isLesson
            ? (unit.lessonKind?.nameZh || '')
            : (unit.lesson?.lessonKind?.nameZh || '');
        const virtualRoom = unit.virtualRoom || {};
        const remark = isFlat
          ? (unit.remark || unit.lessonRemark || '')
          : (unit.remark || unit.lesson?.remark || unit.scheduleRemark || '');

        const isMooc = nameZh.includes('MOOC') || nameZh.includes('mooc') || nameZh.includes('Mooc') ||
                       kindName.includes('MOOC') || kindName.includes('mooc') || kindName.includes('Mooc') ||
                       (virtualRoom && (virtualRoom.nameZh || virtualRoom.name)) ||
                       remark.includes('MOOC') || remark.includes('mooc') ||
                       (isFlat && unit.virtualCampus) ||
                       (isFlat && (unit.courseTypeName || '').includes('MOOC'));

        if (!isMooc) continue;
        if (seen.has(nameZh)) continue;
        seen.add(nameZh);

        let courseName = nameZh.replace(/^（选）/, '').replace(/（MOOC）$/i, '').replace(/（Mooc）$/i, '').trim();
        if (!courseName) continue;

        let teacherName = '';
        if (isLesson) {
          /* get-data lessons 结构: teacherAssignmentString 或 teacherAssignmentStrWithoutCode */
          teacherName = unit.teacherAssignmentStrWithoutCode || unit.teacherAssignmentString || '';
        } else if (!isFlat) {
          const teacher = unit.teacher || {};
          teacherName = teacher.nameZh || teacher.name || '';
        } else {
          const teachers = unit.teachers || [];
          if (Array.isArray(teachers) && teachers.length > 0) {
            teacherName = teachers.map(t => {
              if (typeof t === 'string') { const idx = t.indexOf('('); return idx > 0 ? t.substring(0, idx) : t; }
              return t.name || t.nameZh || '';
            }).filter(Boolean).join(', ');
          }
        }

        let platform = { name: '其他平台', url: '' };
        const fullText = nameZh + ' ' + remark + ' ' + kindName + (isFlat ? (unit.courseTypeName || '') : '');
        if (fullText.includes('学堂在线') || fullText.includes('雨课堂')) platform = { name: '雨课堂', url: 'https://suibe.yuketang.cn/' };
        else if (fullText.includes('超星尔雅') || fullText.includes('超星') || fullText.includes('学习通')) platform = { name: '学习通（超星尔雅）', url: 'https://i.chaoxing.com' };
        else if (fullText.includes('智慧树') || fullText.includes('知到')) platform = { name: '智慧树', url: 'https://www.zhihuishu.com/' };
        else if (fullText.includes('中国大学MOOC') || fullText.includes('icourse')) platform = { name: '中国大学MOOC', url: 'https://www.icourse163.org/' };
        else if (fullText.includes('UOOC') || fullText.includes('优课')) platform = { name: 'UOOC联盟', url: 'https://www.uooc.net.cn/' };

        let remarkUrl = '';
        const urlMatch = fullText.match(/(https?:\/\/[^\s"'<>)]+)/);
        if (urlMatch) remarkUrl = urlMatch[1];

        moocCourses.push({ name: courseName, teacher: teacherName, platform: platform.name, platformUrl: platform.url, remarkUrl });
      } catch (err) {
        console.warn('[EduProxy] 解析 MOOC 课程失败:', err.message);
      }
    }
    return moocCourses;
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
          params: {},  // 不传 semester 参数，获取所有学期成绩
          timeout: 15000,
        }
      );

      const data = res.data;
      if (!data) {
        throw new Error('成绩 API 返回空数据');
      }

      /* 调试：打印成绩 API 返回的数据结构 */
      const semKeys = Object.keys(data.semesterId2studentGrades || data.semesters || {});
      console.log(`[EduProxy] 成绩 API 返回的学期 keys: ${semKeys.join(', ')}`);
      for (const k of semKeys.slice(0, 1)) {
        const sampleList = (data.semesterId2studentGrades || data.semesters || {})[k];
        if (Array.isArray(sampleList) && sampleList.length > 0) {
          console.log(`[EduProxy] 学期 ${k} 第一条成绩原始数据:`, JSON.stringify(sampleList[0]).substring(0, 500));
        }
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

          /* courseType 兼容字符串和对象两种格式
           * 实际数据: "通识教育必修课" (字符串) 或 { nameZh: "必修课" } (对象) */
          const courseType = typeof item.courseType === 'string'
            ? item.courseType
            : (item.courseType?.nameZh || item.courseProperty?.nameZh || item.courseProperty || '');
          const isRequired = courseType.includes('必修');
          const isElective = courseType.includes('选修');
          let type = '必修';
          if (isElective && !isRequired) type = '选修';
          if (!isRequired && !isElective) {
            /* 通识教育必修课等也归类为必修 */
            type = '必修';
          }

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

          /* gaGrade 兼容字符串和对象两种格式
           * 实际数据: "85" (数字字符串) 或 "优秀" (等级文字) 或 { nameZh: "优秀" } (对象) */
          const rawGaGrade = typeof item.gaGrade === 'string'
            ? item.gaGrade
            : (item.gaGrade?.nameZh || '');
          const gp = item.gp || 0;

          /* score 字段可能不存在，优先使用 gaGrade 作为分数 */
          const score = item.score !== undefined && item.score !== null ? item.score : rawGaGrade;

          const isScoreText = !isNaN(score) && score !== null;
          const isGradeLevelText = !isScoreText && rawGaGrade;

          let displayScore;
          let gpaScore;

          if (isScoreText) {
            displayScore = score;
            gpaScore = parseFloat(score);
          } else if (isGradeLevelText) {
            const gradeScoreMap = {
              '优秀': 90, '良好': 85, '中等': 78,
              '及格': 68, '合格': 82, '不合格': 50, '不及格': 50,
            };
            displayScore = rawGaGrade;
            gpaScore = gradeScoreMap[rawGaGrade] || 0;
          } else {
            displayScore = score || rawGaGrade || '';
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

  async getTrainingProgram() {
    if (!this.axiosInstance) throw new Error('未登录教务系统');
    console.log('[EduProxy] 培养方案: 获取 programId...');
    let programId = this.programId || 26740;
    if (programId) {
      console.log('[EduProxy] 培养方案: 使用 programId:', programId);
    }
    const url = `/student/for-std/credit-certification-apply/other_apply/get-all-course-module?programId=${programId}`;
    console.log('[EduProxy] 培养方案: 请求', url);
    const res = await this.axiosInstance.get(url, { timeout: 30000 });
    const data = res.data;
    if (!data) throw new Error('培养方案数据为空');
    console.log('[EduProxy] 培养方案: 数据获取成功，大小:', JSON.stringify(data).length, '字节');
    this._lastTrainingProgramRaw = data;
    return this._parseTrainingProgram(data);
  }

  _parseTrainingProgram(data) {
    const result = { modules: [], totalRequiredCredits: 0, totalCompletedCredits: 0, totalCourses: 0 };
    try {
      const topChildren = data.children || [];
      console.log('[EduProxy] 培养方案: 顶层有', topChildren.length, '个模块');
      const parseModule = (mod, depth = 0) => {
        if (!mod) return null;
        const name = mod.type?.nameZh || mod.nameZh || mod.name || `模块${mod.id}`;
        const reqInfo = mod.requireInfo || {};
        const requiredCredits = parseFloat(reqInfo.requiredCredits) || 0;
        const node = { id: mod.id, name, requiredCredits, completedCredits: 0, children: [], courses: [], depth, creditBySubModule: mod.creditBySubModule || {} };
        if (Array.isArray(mod.children) && mod.children.length > 0) {
          node.children = mod.children.map(c => parseModule(c, depth + 1)).filter(Boolean);
        }
        if (Array.isArray(mod.planCourses) && mod.planCourses.length > 0) {
          node.courses = mod.planCourses.map(pc => {
            const course = pc.course || {};
            const marks = pc.planCourseMarks || [];
            return {
              id: pc.id, code: course.code || '', name: course.nameZh || course.name || '',
              credits: parseFloat(course.credits) || 0, compulsory: pc.compulsory || false,
              property: pc.courseProperty?.nameZh || '', propertyMark: pc.courseProperty?.abbrevia || '',
              marks: marks.map(m => ({ name: m.nameZh || m.name || '', mark: m.mark || '' })),
              terms: pc.readableTerms || [], suggestTerms: pc.readableSuggestTerms || [],
              periodInfo: pc.periodInfo || {}, examMode: pc.examMode?.nameZh || '',
              preCourses: (pc.preCourses || []).map(p => p.course?.nameZh || p.course?.name || '').filter(Boolean),
              completed: false, score: '',
            };
          });
        }
        return node;
      };
      result.modules = topChildren.map(m => parseModule(m, 0)).filter(Boolean);
      const countAll = (modules) => {
        for (const mod of modules) {
          result.totalRequiredCredits += mod.requiredCredits || 0;
          if (mod.courses.length > 0) result.totalCourses += mod.courses.length;
          if (mod.children.length > 0) countAll(mod.children);
        }
      };
      countAll(result.modules);
      console.log('[EduProxy] 培养方案解析完成: 总要求学分', result.totalRequiredCredits, '总课程数', result.totalCourses);
    } catch (err) {
      console.error('[EduProxy] 培养方案解析失败:', err.message);
      result.rawData = data;
    }
    return result;
  }

  async _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EduProxy;
