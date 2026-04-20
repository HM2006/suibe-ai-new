/**
 * 数据库服务模块
 *
 * 使用 better-sqlite3 实现数据持久化（同步API，无需async/await）
 * 管理用户表、课表缓存表、成绩缓存表
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// 数据库文件路径
const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'xiaomao.db');

let db = null;

/**
 * 初始化数据库，创建表
 */
function init() {
  // 确保 data 目录存在
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    console.log('[DB] 已创建 data 目录');
  }

  // 打开数据库连接
  db = new Database(DB_PATH);

  // 启用外键约束
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 创建用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      last_login TEXT,
      edu_connected INTEGER DEFAULT 0
    );
  `);

  // 自动补齐旧表缺失的列（ALTER TABLE ADD COLUMN 如果列已存在会报错，需要忽略）
  const migrateColumns = [
    { table: 'users', column: 'avatar TEXT DEFAULT \'\'' },
  ];
  for (const { table, column } of migrateColumns) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column}`);
    } catch (e) {
      // 列已存在，忽略
    }
  }

  // 确保存在管理员账号
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const existingAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
    if (existingAdmin) {
      // admin 用户名已存在但不是管理员，升级为管理员
      db.prepare("UPDATE users SET role = 'admin', nickname = '管理员' WHERE username = 'admin'").run();
      console.log('[DB] 已将已有用户 admin 升级为管理员');
    } else {
      // 创建新的管理员账号
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      db.prepare("INSERT INTO users (username, password, nickname, role) VALUES ('admin', ?, '管理员', 'admin')")
        .run(hashedPassword);
      console.log('[DB] 已创建默认管理员账号: admin / admin123');
    }
  }

  // 创建课表缓存表
  db.exec(`
    CREATE TABLE IF NOT EXISTS schedule_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      week TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 创建成绩缓存表
  db.exec(`
    CREATE TABLE IF NOT EXISTS grades_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      data TEXT NOT NULL,
      gpa REAL DEFAULT 0,
      total_credits REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 创建随记表（备忘录式，支持多文件）
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      course_name TEXT DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      ai_summary TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // 创建随记附件表
  db.exec(`
    CREATE TABLE IF NOT EXISTS note_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      mimetype TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL DEFAULT 0,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
  `);

  // 创建空教室数据表
  db.exec(`
    CREATE TABLE IF NOT EXISTS empty_rooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      room_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      building TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 0,
      slot_1 INTEGER NOT NULL DEFAULT 0,
      slot_2 INTEGER NOT NULL DEFAULT 0,
      slot_3 INTEGER NOT NULL DEFAULT 0,
      slot_4 INTEGER NOT NULL DEFAULT 0,
      slot_5 INTEGER NOT NULL DEFAULT 0,
      slot_6 INTEGER NOT NULL DEFAULT 0,
      slot_7 INTEGER NOT NULL DEFAULT 0,
      slot_8 INTEGER NOT NULL DEFAULT 0,
      slot_9 INTEGER NOT NULL DEFAULT 0,
      slot_10 INTEGER NOT NULL DEFAULT 0,
      slot_11 INTEGER NOT NULL DEFAULT 0,
      slot_12 INTEGER NOT NULL DEFAULT 0,
      slot_13 INTEGER NOT NULL DEFAULT 0,
      slot_14 INTEGER NOT NULL DEFAULT 0,
      course_name TEXT DEFAULT '',
      teacher TEXT DEFAULT '',
      class_time TEXT DEFAULT '',
      UNIQUE(date, room_id)
    );
  `);

  // 创建空教室抓取元数据表
  db.exec(`
    CREATE TABLE IF NOT EXISTS empty_rooms_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // 创建培养方案缓存表
  db.exec(`
      CREATE TABLE IF NOT EXISTS training_program_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now', 'localtime')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

  console.log('[DB] 数据库表初始化完成');
}

/**
 * 按用户名查询用户
 * @param {string} username
 * @returns {object|null} 用户对象
 */
function getUserByUsername(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username) || null;
}

/**
 * 按ID查询用户
 * @param {number} id
 * @returns {object|null} 用户对象
 */
function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) || null;
}

/**
 * 创建用户
 * @param {string} username - 用户名
 * @param {string} password - 明文密码
 * @param {string} [nickname=''] - 昵称
 * @returns {object} 新创建的用户（不含密码）
 */
function createUser(username, password, nickname = '') {
  // 密码hash
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(password, salt);

  const stmt = db.prepare(
    'INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)'
  );
  const result = stmt.run(username, hashedPassword, nickname);

  // 返回新用户信息（不含密码）
  return getUserById(result.lastInsertRowid);
}

/**
 * 更新最后登录时间
 * @param {number} userId
 */
function updateLastLogin(userId) {
  const stmt = db.prepare(
    "UPDATE users SET last_login = datetime('now', 'localtime') WHERE id = ?"
  );
  stmt.run(userId);
}

/**
 * 更新教务系统连接状态
 * @param {number} userId
 * @param {number} connected - 1 已连接，0 未连接
 */
function updateEduConnected(userId, connected) {
  const stmt = db.prepare(
    'UPDATE users SET edu_connected = ? WHERE id = ?'
  );
  stmt.run(connected, userId);
}

/**
 * 保存课表缓存
 * @param {number} userId
 * @param {object} scheduleData - 课表数据对象
 */
function saveScheduleCache(userId, scheduleData) {
  const dataStr = JSON.stringify(scheduleData);
  const stmt = db.prepare(`
    INSERT INTO schedule_cache (user_id, data)
    VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = datetime('now', 'localtime')
  `);
  // 先删除旧缓存，再插入新缓存（简单策略）
  const deleteStmt = db.prepare('DELETE FROM schedule_cache WHERE user_id = ?');
  const insertStmt = db.prepare(
    "INSERT INTO schedule_cache (user_id, data, week, updated_at) VALUES (?, ?, '', datetime('now', 'localtime'))"
  );

  const transaction = db.transaction(() => {
    deleteStmt.run(userId);
    insertStmt.run(userId, dataStr);
  });
  transaction();
}

/**
 * 获取课表缓存
 * @param {number} userId
 * @returns {object|null} 课表数据对象
 */
function getScheduleCache(userId) {
  const stmt = db.prepare('SELECT * FROM schedule_cache WHERE user_id = ? ORDER BY id DESC LIMIT 1');
  const row = stmt.get(userId);
  if (!row) return null;
  return {
    ...row,
    data: JSON.parse(row.data)
  };
}

/**
 * 保存成绩缓存
 * @param {number} userId
 * @param {object} gradesData - 成绩数据对象
 * @param {number} gpa - GPA
 * @param {number} totalCredits - 总学分
 */
function saveGradesCache(userId, gradesData, gpa, totalCredits) {
  const dataStr = JSON.stringify(gradesData);
  const deleteStmt = db.prepare('DELETE FROM grades_cache WHERE user_id = ?');
  const insertStmt = db.prepare(
    "INSERT INTO grades_cache (user_id, data, gpa, total_credits, updated_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime'))"
  );

  const transaction = db.transaction(() => {
    deleteStmt.run(userId);
    insertStmt.run(userId, dataStr, gpa, totalCredits);
  });
  transaction();
}

/**
 * 获取成绩缓存
 * @param {number} userId
 * @returns {object|null} 成绩数据对象
 */
function getGradesCache(userId) {
  const stmt = db.prepare('SELECT * FROM grades_cache WHERE user_id = ? ORDER BY id DESC LIMIT 1');
  const row = stmt.get(userId);
  if (!row) return null;
  return {
    ...row,
    data: JSON.parse(row.data)
  };
}

/**
 * 获取所有用户列表（用于管理后台，不含密码）
 * @returns {Array} 用户列表
 */
function getAllUsers() {
  const stmt = db.prepare(
    'SELECT id, username, nickname, role, created_at, last_login, edu_connected FROM users ORDER BY id DESC'
  );
  return stmt.all();
}

/**
 * 获取用户统计信息
 * @param {number} userId
 * @returns {object} 用户统计信息
 */
function getUserStats(userId) {
  const user = getUserById(userId);
  if (!user) return null;

  const scheduleCache = getScheduleCache(userId);
  const gradesCache = getGradesCache(userId);

  return {
    user: {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      created_at: user.created_at,
      last_login: user.last_login,
      edu_connected: user.edu_connected,
    },
    scheduleCache,
    gradesCache,
  };
}

/**
 * 更新用户昵称
 * @param {number} userId
 * @param {string} nickname
 */
function updateUserNickname(userId, nickname) {
  const stmt = db.prepare('UPDATE users SET nickname = ? WHERE id = ?');
  stmt.run(nickname, userId);
  return getUserById(userId);
}

/**
 * 更新用户头像
 * @param {number} userId
 * @param {string} avatar - 头像标识（emoji或预设头像名）
 */
function updateUserAvatar(userId, avatar) {
  const stmt = db.prepare('UPDATE users SET avatar = ? WHERE id = ?');
  stmt.run(avatar, userId);
  return getUserById(userId);
}

/**
 * 更新用户密码
 * @param {number} userId
 * @param {string} newPassword - 新的明文密码
 */
function updateUserPassword(userId, newPassword) {
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(newPassword, salt);
  const stmt = db.prepare('UPDATE users SET password = ? WHERE id = ?');
  stmt.run(hashedPassword, userId);
}

/**
 * 删除用户
 * @param {number} userId
 * @returns {boolean} 是否删除成功
 */
function deleteUser(userId) {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  const result = stmt.run(userId);
  return result.changes > 0;
}

// ==================== 随记 ====================

/**
 * 获取用户的所有随记（不含附件数据，附件按需加载）
 * @param {number} userId
 * @returns {Array}
 */
function getNotes(userId) {
  const stmt = db.prepare(
    'SELECT n.*, (SELECT COUNT(*) FROM note_attachments WHERE note_id = n.id) as attachment_count FROM notes n WHERE n.user_id = ? ORDER BY n.updated_at DESC'
  );
  return stmt.all(userId);
}

/**
 * 按ID获取随记（含附件列表，不含附件data）
 * @param {number} noteId
 * @returns {Object|null}
 */
function getNoteById(noteId) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!note) return null;
  const attachments = db.prepare(
    'SELECT * FROM note_attachments WHERE note_id = ? ORDER BY id ASC'
  ).all(noteId);
  return { ...note, attachments };
}

/**
 * 创建随记
 */
function createNote(userId, { title, course_name, content }) {
  const stmt = db.prepare(
    "INSERT INTO notes (user_id, title, course_name, content) VALUES (?, ?, ?, ?)"
  );
  const result = stmt.run(userId, title || '', course_name || '', content || '');
  return getNoteById(result.lastInsertRowid);
}

/**
 * 更新随记
 */
function updateNote(noteId, { title, course_name, content, ai_summary }) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!note) return null;
  const stmt = db.prepare(
    "UPDATE notes SET title = ?, course_name = ?, content = ?, ai_summary = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
  );
  stmt.run(
    title !== undefined ? title : note.title,
    course_name !== undefined ? course_name : note.course_name,
    content !== undefined ? content : note.content,
    ai_summary !== undefined ? ai_summary : note.ai_summary,
    noteId
  );
  return getNoteById(noteId);
}

/**
 * 删除随记（级联删除附件）
 */
function deleteNote(noteId) {
  db.prepare('DELETE FROM note_attachments WHERE note_id = ?').run(noteId);
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(noteId);
  return result.changes > 0;
}

/**
 * 添加附件（base64数据存入数据库）
 */
function addAttachment(noteId, { filename, mimetype, size, data }) {
  const stmt = db.prepare(
    "INSERT INTO note_attachments (note_id, filename, mimetype, size, data) VALUES (?, ?, ?, ?, ?)"
  );
  const result = stmt.run(noteId, filename, mimetype, size, data);
  return result.lastInsertRowid;
}

/**
 * 获取附件完整数据（含base64）
 */
function getAttachmentById(attachmentId) {
  return db.prepare('SELECT * FROM note_attachments WHERE id = ?').get(attachmentId) || null;
}

/**
 * 获取随记的所有附件（含base64数据，用于AI处理）
 */
function getNoteAttachmentsWithData(noteId) {
  return db.prepare('SELECT * FROM note_attachments WHERE note_id = ?').all(noteId);
}

/**
 * 删除附件
 */
function deleteAttachment(attachmentId) {
  const result = db.prepare('DELETE FROM note_attachments WHERE id = ?').run(attachmentId);
  return result.changes > 0;
}

/**
 * 获取用户的所有课程名（从课表缓存中提取，用于随记下拉选择）
 * @param {number} userId
 * @returns {Array<string>}
 */
function getUserCourseNames(userId) {
  const cache = getScheduleCache(userId);
  if (!cache || !cache.data) return [];
  const courses = cache.data.courses || cache.data;
  const nameSet = new Set();
  const extract = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach(item => {
      if (item.name) nameSet.add(item.name);
      if (Array.isArray(item)) extract(item);
    });
  };
  if (Array.isArray(courses)) {
    extract(courses);
  } else if (typeof courses === 'object') {
    Object.values(courses).forEach(arr => extract(arr));
  }
  return Array.from(nameSet);
}

function saveTrainingProgramCache(userId, programData) {
  const data = JSON.stringify(programData);
  const stmt = db.prepare(
    "INSERT INTO training_program_cache (user_id, data, updated_at) VALUES (?, ?, datetime('now','localtime'))"
  );
  stmt.run(userId, data);
}

function getTrainingProgramCache(userId) {
  try {
    const stmt = db.prepare('SELECT * FROM training_program_cache WHERE user_id = ? ORDER BY id DESC LIMIT 1');
    const row = stmt.get(userId);
    if (!row) return null;
    return { ...row, data: JSON.parse(row.data) };
  } catch (e) {
    return null;
  }
}

/**
 * 获取数据库实例（供需要直接操作db的模块使用）
 * @returns {Database}
 */
function getDB() {
  return db;
}

module.exports = {
  init,
  getDB,
  getUserByUsername,
  getUserById,
  createUser,
  updateLastLogin,
  updateEduConnected,
  saveScheduleCache,
  getScheduleCache,
  saveGradesCache,
  getGradesCache,
  getAllUsers,
  getUserStats,
  updateUserNickname,
  updateUserAvatar,
  updateUserPassword,
  deleteUser,
  // 随记
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  addAttachment,
  getAttachmentById,
  getNoteAttachmentsWithData,
  deleteAttachment,
  getUserCourseNames,
  // 培养方案
  saveTrainingProgramCache,
  getTrainingProgramCache,
};
