// Turso/libSQL 云数据库 - 兼容 Vercel Serverless 环境
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

let _client = null;
let _initialized = false;

function getClient() {
  if (_client) return _client;
  
  let url = (process.env.TURSO_DATABASE_URL || '').trim();
  const authToken = (process.env.TURSO_AUTH_TOKEN || '').trim();
  
  // 如果 URL 包含多个，取第一个（去掉换行和多余空格）
  url = url.split(/\s+/)[0] || url;
  
  if (!url) {
    throw new Error('TURSO_DATABASE_URL environment variable is not set');
  }
  
  // 如果 URL 是 libsql:// 开头，尝试转换为 https://（Vercel 环境更兼容）
  if (url.startsWith('libsql://')) {
    url = url.replace('libsql://', 'https://');
  }
  
  if (!url.startsWith('https://')) {
    throw new Error('TURSO_DATABASE_URL must be libsql:// or https:// format');
  }
  
  try {
    _client = createClient({ url, authToken });
  } catch (e) {
    console.error('Create client error:', e.message);
    throw e;
  }
  return _client;
}

async function initDB() {
  if (_initialized) return;
  _initialized = true;
  
  const client = getClient();
  
  // 创建表
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      points INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT DEFAULT '其他',
      reward TEXT DEFAULT '',
      difficulty TEXT DEFAULT '简单',
      status TEXT DEFAULT 'open',
      image TEXT DEFAULT '',
      max_accepts INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS accepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  await client.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // 创建反馈表
  await client.execute(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT DEFAULT '',
      contact TEXT DEFAULT '',
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建登录日志表
  await client.execute(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT DEFAULT '',
      ip TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      visit_type TEXT DEFAULT 'visit'
    )
  `);
  
  // 辅助函数：确保表中存在某字段
  async function ensureColumn(table, column, type) {
    try {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      const exists = info.rows.some(r => r.name === column);
      if (!exists) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`Added column ${column} to ${table}`);
      }
    } catch (e) {
      console.error(`Ensure column ${table}.${column} error:`, e.message);
    }
  }
  
  // 确保所有历史字段都存在
  await ensureColumn('users', 'is_admin', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'login_count', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'last_login_at', 'TEXT DEFAULT \'\'');
  await ensureColumn('tasks', 'max_accepts', 'INTEGER DEFAULT 0');
  await ensureColumn('login_logs', 'visit_type', 'TEXT DEFAULT \'visit\'');
  
  // 辅助函数：确保表中存在某字段
  async function ensureColumn(table, column, type) {
    try {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      const exists = info.rows.some(r => r.name === column);
      if (!exists) {
        await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        console.log(`Added column ${column} to ${table}`);
      }
    } catch (e) {
      console.error(`Ensure column ${table}.${column} error:`, e.message);
    }
  }
  
  // 确保所有历史字段都存在
  await ensureColumn('users', 'is_admin', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'login_count', 'INTEGER DEFAULT 0');
  await ensureColumn('users', 'last_login_at', 'TEXT DEFAULT \'\'');
  await ensureColumn('tasks', 'max_accepts', 'INTEGER DEFAULT 0');
  await ensureColumn('login_logs', 'visit_type', 'TEXT DEFAULT \'visit\'');
  
  // 插入示例数据
  const countResult = await client.execute('SELECT COUNT(*) as count FROM users');
  if (countResult.rows[0].count === 0) {
    await seedDB(client);
  }
  
  // 设置 huangyanbin 为管理员
  await client.execute({
    sql: 'UPDATE users SET is_admin = 1 WHERE username = ?',
    args: ['huangyanbin']
  });
}

async function seedDB(client) {
  const hashedPwd = bcrypt.hashSync('123456', 10);
  
  await client.execute({
    sql: 'INSERT INTO users (username, password, avatar, bio, points) VALUES (?, ?, ?, ?, ?)',
    args: ['demo', hashedPwd, '🦊', '热爱挑战的冒险家', 120]
  });
  
  await client.execute({
    sql: 'INSERT INTO users (username, password, avatar, bio, points) VALUES (?, ?, ?, ?, ?)',
    args: ['tester', hashedPwd, '🐱', '专业试水选手', 45]
  });
  
  const tasks = [
    [1, '拍一张猫咪翻肚皮的照片', '在街上或朋友家拍到猫咪翻肚皮的可爱瞬间，要求清晰可见猫咪表情。', '摄影', '5 积分', '简单'],
    [1, '用三种语言说"你好"', '录制一段视频，用中文、英文、日语分别说"你好"，时长不超过10秒。', '挑战', '10 积分', '简单'],
    [1, '画出你今天的心情', '用任何绘画工具（纸笔或数字）画出你今天的心情，拍照上传。', '创意', '15 积分', '中等'],
    [2, '找到3种不同颜色的花', '在户外找到红色、黄色、紫色各一朵花，拍合照上传。', '探索', '8 积分', '简单'],
    [2, '写一首关于咖啡的俳句', '5-7-5 音节格式，写一首关于咖啡的俳句，中英文皆可。', '写作', '12 积分', '中等'],
    [1, '倒立30秒挑战', '靠墙倒立保持30秒，录制视频证明。安全第一！', '运动', '25 积分', '困难'],
    [2, '用冰箱里的食材做一道菜', '只能用冰箱里现有的食材，做一道创意料理，拍照+菜名。', '生活', '10 积分', '简单'],
    [1, '模仿名画拍照', '选择一幅世界名画，用日常物品模仿画中场景拍照。', '创意', '20 积分', '中等'],
  ];
  
  for (const t of tasks) {
    await client.execute({
      sql: 'INSERT INTO tasks (user_id, title, description, category, reward, difficulty, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [t[0], t[1], t[2], t[3], t[4], t[5], 'open']
    });
  }
}

// 异步包装的 db 对象，兼容 routes/index.js 的调用方式
// 注意：routes/index.js 里的所有 db.prepare().get/all/run 需要改成异步
const db = {
  prepare(sql) {
    return {
      async get(...params) {
        const client = getClient();
        const result = await client.execute({ sql, args: params });
        return result.rows[0] || undefined;
      },
      async all(...params) {
        const client = getClient();
        const result = await client.execute({ sql, args: params });
        return result.rows;
      },
      async run(...params) {
        const client = getClient();
        const result = await client.execute({ sql, args: params });
        return { lastInsertRowid: result.lastInsertRowid, changes: result.rowsAffected };
      },
    };
  },
};

module.exports = { db, initDB, getClient };
