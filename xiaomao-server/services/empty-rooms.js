/**
 * 空教室抓取服务
 *
 * 使用 Puppeteer 访问学校空教室查询网站，抓取各楼宇教室的占用数据，
 * 并存入本地数据库供查询使用。
 *
 * 数据来源: https://aws.suibe.edu.cn/r/w?cmd=com.awspaas.user.apps.datamanager_html&...
 * API端点: ../r/jd?cmd=com.awspaas.user.apps.datamanager_querycmd
 */

const puppeteer = require('puppeteer');
const db = require('./database').getDB();

// ==================== 常量配置 ====================

const PAGE_URL = 'https://aws.suibe.edu.cn/r/w?cmd=com.awspaas.user.apps.datamanager_html&appId=com.awspaas.user.apps.datamanager&html=echartHt.html&sid=ck&ext5=0&ext3=FONTEND20250217001_S_';
const API_ENDPOINT = '../r/jd?cmd=com.awspaas.user.apps.datamanager_querycmd';

// 楼宇代码映射
const BUILDING_CODES = {
  SAA: '教学楼A楼',
  SAB: '教学楼B楼',
  SAC: '教学楼C楼',
  SAD: '教学楼D楼',
  TST: '图文信息楼',
  GB: '古北综合楼',
};

// roomid 前缀 -> 楼宇名称
const ROOMID_PREFIX_MAP = {
  SAA: '教学楼A楼',
  SAB: '教学楼B楼',
  SAC: '教学楼C楼',
  SAD: '教学楼D楼',
  TST: '图文信息楼',
  GB: '古北综合楼',
};

// 抓取日期范围
const FETCH_END_DATE = '2026-06-30';

// ==================== 单例模式 ====================

let instance = null;

class EmptyRoomsService {
  constructor() {
    if (instance) {
      throw new Error('EmptyRoomsService 是单例类，请使用 EmptyRoomsService.getInstance() 获取实例');
    }
    this.browser = null;
    this.fetching = false; // 是否正在抓取
  }

  static getInstance() {
    if (!instance) {
      instance = new EmptyRoomsService();
    }
    return instance;
  }

  // ==================== 浏览器生命周期 ====================

  async _launchBrowser() {
    if (this.browser) {
      try {
        if (this.browser.connected) return;
      } catch {
        this.browser = null;
      }
    }

    console.log('[EmptyRooms] 正在启动 headless 浏览器...');
    const launchArgs = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--window-size=1280,800',
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    };
    this.browser = await puppeteer.launch(launchArgs);
    console.log('[EmptyRooms] 浏览器启动成功');
  }

  async _closeBrowser() {
    try {
      if (this.browser) {
        await this.browser.close();
        console.log('[EmptyRooms] 浏览器已关闭');
      }
    } catch (error) {
      console.warn('[EmptyRooms] 关闭浏览器时出错:', error.message);
    } finally {
      this.browser = null;
    }
  }

  // ==================== 核心抓取逻辑 ====================

  /**
   * 抓取空教室数据并存入数据库
   * 遍历从今天到 FETCH_END_DATE 的每个工作日，逐日抓取
   * @param {Object} [options] - 可选配置
   * @param {string} [options.startDate] - 自定义起始日期 (YYYY-MM-DD)，默认今天
   * @param {string} [options.endDate] - 自定义结束日期 (YYYY-MM-DD)，默认 2026-06-30
   * @returns {Object} 抓取结果统计
   */
  async fetchEmptyRooms(options = {}) {
    if (this.fetching) {
      throw new Error('抓取任务正在进行中，请稍后再试');
    }
    this.fetching = true;

    let page = null;
    const startDate = options.startDate || _formatDate(new Date());
    const endDate = options.endDate || FETCH_END_DATE;

    try {
      // 启动浏览器
      await this._launchBrowser();
      page = await this.browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      page.setDefaultNavigationTimeout(30000);
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // 1. 访问空教室页面，获取 session
      console.log('[EmptyRooms] 正在访问空教室页面...');
      await page.goto(PAGE_URL, { waitUntil: 'load', timeout: 30000 });
      await _delay(2000); // 等待页面和 session 初始化完成
      console.log('[EmptyRooms] 页面加载完成');

      // 2. 获取所有楼宇的教室列表
      console.log('[EmptyRooms] 正在获取教室列表...');
      const allRooms = await this._fetchRoomList(page);
      console.log(`[EmptyRooms] 共获取 ${allRooms.length} 个教室`);

      if (allRooms.length === 0) {
        throw new Error('未获取到任何教室数据，请检查网站是否可访问');
      }

      // 3. 生成工作日列表
      const workdays = _getWorkdays(startDate, endDate);
      console.log(`[EmptyRooms] 需要抓取 ${workdays.length} 个工作日 (${startDate} ~ ${endDate})`);

      if (workdays.length === 0) {
        throw new Error('指定日期范围内没有工作日');
      }

      // 4. 逐日抓取占用数据
      let totalInserted = 0;
      let errorDays = [];

      for (let i = 0; i < workdays.length; i++) {
        const date = workdays[i];
        console.log(`[EmptyRooms] 正在抓取 ${date} 的数据 (${i + 1}/${workdays.length})...`);

        try {
          const occupancyData = await this._fetchOccupancy(page, date);
          const inserted = this._saveData(date, allRooms, occupancyData);
          totalInserted += inserted;
          console.log(`[EmptyRooms] ${date} 数据已保存，${inserted} 条记录`);
        } catch (err) {
          console.error(`[EmptyRooms] ${date} 抓取失败:`, err.message);
          errorDays.push({ date, error: err.message });
        }

        // 每次请求间隔，避免请求过快
        if (i < workdays.length - 1) {
          await _delay(500);
        }
      }

      // 5. 更新元数据
      this._updateMeta('last_fetch_time', new Date().toISOString());
      this._updateMeta('fetch_start_date', startDate);
      this._updateMeta('fetch_end_date', endDate);
      this._updateMeta('total_rooms', String(allRooms.length));
      this._updateMeta('total_days', String(workdays.length));
      this._updateMeta('total_records', String(totalInserted));
      if (errorDays.length > 0) {
        this._updateMeta('error_days', JSON.stringify(errorDays));
      }

      console.log(`[EmptyRooms] 抓取完成！共 ${totalInserted} 条记录，${errorDays.length} 个日期失败`);

      return {
        success: true,
        totalRooms: allRooms.length,
        totalDays: workdays.length,
        totalRecords: totalInserted,
        errorDays,
        dateRange: { start: startDate, end: endDate },
      };
    } catch (error) {
      console.error('[EmptyRooms] 抓取失败:', error.message);
      throw error;
    } finally {
      this.fetching = false;
      try {
        if (page) await page.close();
      } catch {}
      await this._closeBrowser();
    }
  }

  /**
   * 获取所有楼宇的教室列表
   * @param {Page} page - Puppeteer 页面实例
   * @returns {Array} 教室列表
   */
  async _fetchRoomList(page) {
    const allRooms = [];
    const buildingCodes = Object.keys(BUILDING_CODES);

    for (const code of buildingCodes) {
      try {
        const rooms = await page.evaluate(async (endpoint, buildingCode) => {
          try {
            const resp = await fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cmdParam: 'SQL20250217001',
                TJ: { C20250217003: buildingCode },
              }),
            });
            const data = await resp.json();
            return data;
          } catch (e) {
            return { error: e.message };
          }
        }, API_ENDPOINT, code);

        if (rooms && !rooms.error) {
          // API 返回的数据可能是数组或包含数组的对象
          const roomList = Array.isArray(rooms) ? rooms : (rooms.data || rooms.rows || []);
          for (const room of roomList) {
            const roomId = room.ROOMID || room.roomid || '';
            const roomName = room.ROOMNAME || room.roomname || '';
            if (!roomId || !roomName) continue;

            const building = _getBuildingFromRoomId(roomId);
            const capacity = parseInt(room.CAPACITY || room.capacity || room.SEATS || room.seats || 0) || 0;

            allRooms.push({
              roomId,
              roomName,
              building,
              capacity,
            });
          }
          console.log(`[EmptyRooms] ${BUILDING_CODES[code]}: 获取 ${allRooms.length} 个教室`);
        } else {
          console.warn(`[EmptyRooms] ${BUILDING_CODES[code]}: 获取失败`, rooms.error || '无数据');
        }

        await _delay(300);
      } catch (err) {
        console.warn(`[EmptyRooms] ${BUILDING_CODES[code]}: 请求异常 -`, err.message);
      }
    }

    // 去重（同一教室可能在不同请求中出现）
    const seen = new Set();
    return allRooms.filter(room => {
      if (seen.has(room.roomId)) return false;
      seen.add(room.roomId);
      return true;
    });
  }

  /**
   * 获取某一天的教室占用数据
   * @param {Page} page - Puppeteer 页面实例
   * @param {string} date - 日期 (YYYY-MM-DD)
   * @returns {Object} 占用数据映射 roomId -> occupancy info
   */
  async _fetchOccupancy(page, date) {
    const result = await page.evaluate(async (endpoint, dateStr) => {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cmdParam: 'SQL20250217001',
            TJ: { C20250217008: { jssj: dateStr } },
          }),
        });
        const data = await resp.json();
        return data;
      } catch (e) {
        return { error: e.message };
      }
    }, API_ENDPOINT, date);

    if (!result || result.error) {
      throw new Error(result.error || '获取占用数据失败');
    }

    // 构建 roomId -> 占用信息 的映射
    const occupancyMap = {};
    const dataList = Array.isArray(result) ? result : (result.data || result.rows || []);

    for (const item of dataList) {
      const roomId = item.ROOMID || item.roomid || '';
      if (!roomId) continue;

      // 提取 JC01-JC14 的占用状态
      const slots = {};
      for (let i = 1; i <= 14; i++) {
        const key = `JC${String(i).padStart(2, '0')}`;
        const val = item[key];
        slots[i] = val === 1 || val === '1' ? 1 : 0;
      }

      occupancyMap[roomId] = {
        roomId,
        roomName: item.ROOMNAME || item.roomname || '',
        slots,
        courseName: item.YWKCM || item.ywkcm || '',
        teacher: item.XM_1 || item.xm_1 || '',
        classTime: item.SKSJ || item.sksj || '',
      };
    }

    return occupancyMap;
  }

  /**
   * 将抓取的数据保存到数据库
   * @param {string} date - 日期
   * @param {Array} allRooms - 所有教室列表
   * @param {Object} occupancyMap - 占用数据映射
   * @returns {number} 插入/更新的记录数
   */
  _saveData(date, allRooms, occupancyMap) {
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO empty_rooms (
        date, room_id, room_name, building, capacity,
        slot_1, slot_2, slot_3, slot_4, slot_5, slot_6, slot_7, slot_8,
        slot_9, slot_10, slot_11, slot_12, slot_13, slot_14,
        course_name, teacher, class_time
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    let count = 0;
    const transaction = db.transaction(() => {
      for (const room of allRooms) {
        const occupancy = occupancyMap[room.roomId];
        const slots = occupancy ? occupancy.slots : {};

        insertStmt.run(
          date,
          room.roomId,
          room.roomName,
          room.building,
          room.capacity,
          slots[1] || 0,
          slots[2] || 0,
          slots[3] || 0,
          slots[4] || 0,
          slots[5] || 0,
          slots[6] || 0,
          slots[7] || 0,
          slots[8] || 0,
          slots[9] || 0,
          slots[10] || 0,
          slots[11] || 0,
          slots[12] || 0,
          slots[13] || 0,
          slots[14] || 0,
          occupancy ? occupancy.courseName : '',
          occupancy ? occupancy.teacher : '',
          occupancy ? occupancy.classTime : '',
        );
        count++;
      }
    });

    transaction();
    return count;
  }

  /**
   * 更新元数据
   */
  _updateMeta(key, value) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO empty_rooms_meta (key, value, updated_at)
      VALUES (?, ?, datetime('now', 'localtime'))
    `);
    stmt.run(key, value);
  }

  /**
   * 获取元数据
   */
  getMeta(key) {
    const row = db.prepare('SELECT value FROM empty_rooms_meta WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  /**
   * 获取抓取状态
   */
  getStatus() {
    const lastFetchTime = this.getMeta('last_fetch_time');
    const startDate = this.getMeta('fetch_start_date');
    const endDate = this.getMeta('fetch_end_date');
    const totalRooms = this.getMeta('total_rooms');
    const totalDays = this.getMeta('total_days');
    const totalRecords = this.getMeta('total_records');
    const errorDays = this.getMeta('error_days');

    // 查询数据库中实际覆盖的日期范围
    const dateRange = db.prepare('SELECT MIN(date) as min_date, MAX(date) as max_date, COUNT(DISTINCT date) as days FROM empty_rooms').get();
    const roomCount = db.prepare('SELECT COUNT(DISTINCT room_id) as rooms FROM empty_rooms').get();

    return {
      fetching: this.fetching,
      lastFetchTime,
      fetchRange: { start: startDate, end: endDate },
      actualRange: dateRange ? { start: dateRange.min_date, end: dateRange.max_date, days: dateRange.days } : null,
      totalRooms: totalRooms ? parseInt(totalRooms) : null,
      actualRooms: roomCount ? roomCount.rooms : 0,
      totalDays: totalDays ? parseInt(totalDays) : null,
      totalRecords: totalRecords ? parseInt(totalRecords) : null,
      errorDays: errorDays ? JSON.parse(errorDays) : [],
    };
  }

  /**
   * 查询空教室
   * @param {Object} params - 查询参数
   * @param {string} params.date - 日期 (YYYY-MM-DD)
   * @param {Array<number>} params.slots - 节次数组，如 [1,2,3]
   * @param {number} [params.minCapacity] - 最小容量
   * @param {string} [params.building] - 楼宇筛选
   * @returns {Array} 空教室列表
   */
  queryEmptyRooms(params) {
    const { date, slots, minCapacity, building } = params;

    if (!date) {
      throw new Error('缺少必要参数: date');
    }
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      throw new Error('缺少必要参数: slots (节次数组)');
    }

    // 构建 SQL 查询：所有指定节次都空闲的教室
    // slot_N = 0 表示空闲
    const slotConditions = slots.map(s => `slot_${s} = 0`).join(' AND ');

    let sql = `
      SELECT room_id, room_name, building, capacity,
        slot_1, slot_2, slot_3, slot_4, slot_5, slot_6, slot_7, slot_8,
        slot_9, slot_10, slot_11, slot_12, slot_13, slot_14,
        course_name, teacher, class_time
      FROM empty_rooms
      WHERE date = ? AND ${slotConditions}
    `;

    const queryParams = [date];

    if (minCapacity && minCapacity > 0) {
      sql += ' AND capacity >= ?';
      queryParams.push(minCapacity);
    }

    if (building) {
      sql += ' AND building = ?';
      queryParams.push(building);
    }

    sql += ' ORDER BY building, capacity DESC, room_id';

    const stmt = db.prepare(sql);
    const rows = stmt.all(...queryParams);

    // 返回格式化结果
    return rows.map(row => {
      // 构建该教室的完整占用状态
      const allSlots = [];
      for (let i = 1; i <= 14; i++) {
        allSlots.push({
          slot: i,
          occupied: row[`slot_${i}`] === 1,
        });
      }

      return {
        roomId: row.room_id,
        roomName: row.room_name,
        building: row.building,
        capacity: row.capacity,
        slots: allSlots,
        courseName: row.course_name || null,
        teacher: row.teacher || null,
        classTime: row.class_time || null,
      };
    });
  }
}

// ==================== 工具函数 ====================

/**
 * 根据 roomid 前缀判断所属楼宇
 */
function _getBuildingFromRoomId(roomId) {
  if (!roomId) return '未知';
  for (const [prefix, name] of Object.entries(ROOMID_PREFIX_MAP)) {
    if (roomId.startsWith(prefix)) return name;
  }
  return '未知';
}

/**
 * 生成工作日列表（周一到周五，排除周末）
 */
function _getWorkdays(startDate, endDate) {
  const days = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  const current = new Date(start);
  while (current <= end) {
    const day = current.getDay();
    // 0=周日, 6=周六，只取工作日
    if (day !== 0 && day !== 6) {
      days.push(_formatDate(current));
    }
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function _formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 延迟指定毫秒
 */
function _delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = EmptyRoomsService;
