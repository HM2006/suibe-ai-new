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

  // 创建课程随记表
  db.exec(`
    CREATE TABLE IF NOT EXISTS course_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      course_name TEXT NOT NULL,
      course_code TEXT DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, course_name),
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

// ==================== 课程随记 ====================

/**
 * 获取用户的所有课程随记
 * @param {number} userId
 * @returns {Array} 随记列表
 */
function getCourseNotes(userId) {
  const stmt = db.prepare(
    'SELECT * FROM course_notes WHERE user_id = ? ORDER BY updated_at DESC'
  );
  return stmt.all(userId);
}

/**
 * 获取用户某门课程的随记
 * @param {number} userId
 * @param {string} courseName - 课程名称
 * @returns {Object|null} 随记对象
 */
function getCourseNoteByName(userId, courseName) {
  const stmt = db.prepare(
    'SELECT * FROM course_notes WHERE user_id = ? AND course_name = ?'
  );
  return stmt.get(userId, courseName) || null;
}

/**
 * 按ID获取课程随记
 * @param {number} noteId
 * @returns {Object|null} 随记对象
 */
function getCourseNoteById(noteId) {
  const stmt = db.prepare('SELECT * FROM course_notes WHERE id = ?');
  return stmt.get(noteId) || null;
}

/**
 * 保存或更新课程随记（按课程名唯一）
 * @param {number} userId
 * @param {string} courseName - 课程名称
 * @param {string} courseCode - 课程代码（可选）
 * @param {string} content - 随记内容
 * @returns {Object} 保存后的随记
 */
function saveCourseNote(userId, courseName, courseCode, content) {
  const existing = getCourseNoteByName(userId, courseName);
  if (existing) {
    // 更新已有随记
    const stmt = db.prepare(
      "UPDATE course_notes SET content = ?, course_code = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
    );
    stmt.run(content, courseCode || '', existing.id);
    return getCourseNoteByName(userId, courseName);
  } else {
    // 新建随记
    const stmt = db.prepare(
      "INSERT INTO course_notes (user_id, course_name, course_code, content) VALUES (?, ?, ?, ?)"
    );
    const result = stmt.run(userId, courseName, courseCode || '', content);
    return getCourseNoteByName(userId, courseName);
  }
}

/**
 * 删除课程随记
 * @param {number} noteId
 * @returns {boolean} 是否删除成功
 */
function deleteCourseNote(noteId) {
  const stmt = db.prepare('DELETE FROM course_notes WHERE id = ?');
  const result = stmt.run(noteId);
  return result.changes > 0;
}

module.exports = {
  init,
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
  getCourseNotes,
  getCourseNoteByName,
  getCourseNoteById,
  saveCourseNote,
  deleteCourseNote,
};
