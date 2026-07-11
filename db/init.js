const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'taskhub.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// 初始化数据库表
function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS accepts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  // 插入示例数据（如果没有数据）
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
  if (userCount.count === 0) {
    seedDB();
  }
}

function seedDB() {
  // 创建示例用户
  const hashedPwd = bcrypt.hashSync('123456', 10);
  const insertUser = db.prepare('INSERT INTO users (username, password, avatar, bio, points) VALUES (?, ?, ?, ?, ?)');
  insertUser.run('demo', hashedPwd, '🦊', '热爱挑战的冒险家', 120);
  insertUser.run('tester', hashedPwd, '🐱', '专业试水选手', 45);

  // 创建示例任务
  const insertTask = db.prepare(`
    INSERT INTO tasks (user_id, title, description, category, reward, difficulty, image, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tasks = [
    [1, '拍一张猫咪翻肚皮的照片', '在街上或朋友家拍到猫咪翻肚皮的可爱瞬间，要求清晰可见猫咪表情。', '摄影', '5 积分', '简单', '', 'open'],
    [1, '用三种语言说"你好"', '录制一段视频，用中文、英文、日语分别说"你好"，时长不超过10秒。', '挑战', '10 积分', '简单', '', 'open'],
    [1, '画出你今天的心情', '用任何绘画工具（纸笔或数字）画出你今天的心情，拍照上传。', '创意', '15 积分', '中等', '', 'open'],
    [2, '找到3种不同颜色的花', '在户外找到红色、黄色、紫色各一朵花，拍合照上传。', '探索', '8 积分', '简单', '', 'open'],
    [2, '写一首关于咖啡的俳句', '5-7-5 音节格式，写一首关于咖啡的俳句，中英文皆可。', '写作', '12 积分', '中等', '', 'open'],
    [1, '倒立30秒挑战', '靠墙倒立保持30秒，录制视频证明。安全第一！', '运动', '25 积分', '困难', '', 'open'],
    [2, '用冰箱里的食材做一道菜', '只能用冰箱里现有的食材，做一道创意料理，拍照+菜名。', '生活', '10 积分', '简单', '', 'open'],
    [1, '模仿名画拍照', '选择一幅世界名画，用日常物品模仿画中场景拍照。', '创意', '20 积分', '中等', '', 'open'],
  ];

  tasks.forEach(t => insertTask.run(...t));
}

module.exports = { db, initDB };
