// 内存数据库 - 兼容 Vercel Serverless 环境
// 注意：数据存在内存中，Serverless 函数冷启动后数据会重置

const bcrypt = require('bcryptjs');

// 内存数据
const data = {
  users: [],
  tasks: [],
  accepts: [],
  comments: [],
  nextUserId: 1,
  nextTaskId: 1,
  nextAcceptId: 1,
  nextCommentId: 1,
};

let initialized = false;

function initDB() {
  if (initialized) return;
  initialized = true;

  // 创建示例用户
  const hashedPwd = bcrypt.hashSync('123456', 10);
  data.users.push({ id: data.nextUserId++, username: 'demo', password: hashedPwd, avatar: '🦊', bio: '热爱挑战的冒险家', points: 120, created_at: new Date().toISOString() });
  data.users.push({ id: data.nextUserId++, username: 'tester', password: hashedPwd, avatar: '🐱', bio: '专业试水选手', points: 45, created_at: new Date().toISOString() });

  // 创建示例任务
  const tasks = [
    { title: '拍一张猫咪翻肚皮的照片', description: '在街上或朋友家拍到猫咪翻肚皮的可爱瞬间，要求清晰可见猫咪表情。', category: '摄影', reward: '5 积分', difficulty: '简单' },
    { title: '用三种语言说"你好"', description: '录制一段视频，用中文、英文、日语分别说"你好"，时长不超过10秒。', category: '挑战', reward: '10 积分', difficulty: '简单' },
    { title: '画出你今天的心情', description: '用任何绘画工具（纸笔或数字）画出你今天的心情，拍照上传。', category: '创意', reward: '15 积分', difficulty: '中等' },
    { title: '找到3种不同颜色的花', description: '在户外找到红色、黄色、紫色各一朵花，拍合照上传。', category: '探索', reward: '8 积分', difficulty: '简单' },
    { title: '写一首关于咖啡���俳句', description: '5-7-5 音节格式，写一首关于咖啡的俳句，中英文皆可。', category: '写作', reward: '12 积分', difficulty: '中等' },
    { title: '倒立30秒挑战', description: '靠墙倒立保持30秒，录制视频证明。安全第一！', category: '运动', reward: '25 积分', difficulty: '困难' },
    { title: '用冰箱里的食材做一道菜', description: '只能用冰箱里现有的食材，做一道创意料理，拍照+菜名。', category: '生活', reward: '10 积分', difficulty: '简单' },
    { title: '模仿名画拍照', description: '选择一幅世界名画，用日常物品模仿画中场景拍照。', category: '创意', reward: '20 积分', difficulty: '中等' },
  ];

  tasks.forEach((t, i) => {
    data.tasks.push({
      id: data.nextTaskId++,
      user_id: i % 2 === 0 ? 1 : 2,
      title: t.title,
      description: t.description,
      category: t.category,
      reward: t.reward,
      difficulty: t.difficulty,
      status: 'open',
      image: '',
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
    });
  });
}

// 模拟 better-sqlite3 的 prepare 接口，保持 routes/index.js 不用改
const db = {
  prepare(sql) {
    return {
      get(...params) {
        return executeQuery(sql, params, 'get');
      },
      all(...params) {
        return executeQuery(sql, params, 'all');
      },
      run(...params) {
        return executeQuery(sql, params, 'run');
      },
    };
  },
  exec() {},
  pragma() {},
};

function executeQuery(sql, params, mode) {
  const sqlLower = sql.trim().toLowerCase();

  // SELECT COUNT
  if (sqlLower.includes('select count(*) as count from users')) {
    return { count: data.users.length };
  }
  if (sqlLower.includes('select count(*) as count from accepts') && sqlLower.includes('where task_id')) {
    return { count: data.accepts.filter(a => a.task_id === params[0]).length };
  }
  if (sqlLower.includes('select count(*)') && sqlLower.includes('from tasks where user_id')) {
    return { count: data.tasks.filter(t => t.user_id === params[0]).length };
  }
  if (sqlLower.includes('select count(*)') && sqlLower.includes('from accepts where user_id')) {
    return { count: data.accepts.filter(a => a.user_id === params[0]).length };
  }

  // SELECT user by username
  if (sqlLower.includes('select id from users where username')) {
    return data.users.find(u => u.username === params[0]) ? { id: 1 } : undefined;
  }
  if (sqlLower.includes('select * from users where username')) {
    return data.users.find(u => u.username === params[0]);
  }

  // SELECT user by id
  if (sqlLower.includes('select id, username, avatar, points, bio from users where id')) {
    return data.users.find(u => u.id === params[0]);
  }

  // INSERT user
  if (sqlLower.includes('insert into users')) {
    const id = data.nextUserId++;
    data.users.push({ id, username: params[0], password: params[1], avatar: params[2], bio: '', points: 0, created_at: new Date().toISOString() });
    return { lastInsertRowid: id };
  }

  // UPDATE user points
  if (sqlLower.includes('update users set points')) {
    const user = data.users.find(u => u.id === params[1]);
    if (user) {
      if (sqlLower.includes('points + 2')) user.points += 2;
      else if (sqlLower.includes('points + 1')) user.points += 1;
    }
    return { changes: user ? 1 : 0 };
  }

  // UPDATE profile
  if (sqlLower.includes('update users set bio')) {
    const user = data.users.find(u => u.id === params[2]);
    if (user) { user.bio = params[0]; user.avatar = params[1]; }
    return { changes: user ? 1 : 0 };
  }

  // SELECT tasks with join (任务列表)
  if (sqlLower.includes('from tasks t') && sqlLower.includes('join users u') && sqlLower.includes('where t.status')) {
    let tasks = data.tasks.filter(t => t.status === 'open');
    
    const categoryIdx = params.indexOf(params.find(p => typeof p === 'string' && p !== '%'));
    
    // 处理 category 筛选
    if (sqlLower.includes('and t.category = ?')) {
      const cat = params[0];
      tasks = tasks.filter(t => t.category === cat);
    }
    // 处理 keyword 搜索
    if (sqlLower.includes('t.title like')) {
      const kw = params.find(p => typeof p === 'string' && p.startsWith('%'));
      if (kw) {
        const keyword = kw.replace(/%/g, '').toLowerCase();
        tasks = tasks.filter(t => t.title.toLowerCase().includes(keyword) || t.description.toLowerCase().includes(keyword));
      }
    }

    tasks.sort((a, b) => b.id - a.id);
    return tasks.map(t => {
      const user = data.users.find(u => u.id === t.user_id);
      return { ...t, username: user?.username, avatar: user?.avatar };
    });
  }

  // SELECT single task with join
  if (sqlLower.includes('from tasks t') && sqlLower.includes('join users u') && sqlLower.includes('where t.id = ?')) {
    const task = data.tasks.find(t => t.id === params[0]);
    if (!task) return undefined;
    const user = data.users.find(u => u.id === task.user_id);
    return { ...task, username: user?.username, avatar: user?.avatar };
  }

  // INSERT task
  if (sqlLower.includes('insert into tasks')) {
    const id = data.nextTaskId++;
    data.tasks.push({
      id, user_id: params[0], title: params[1], description: params[2],
      category: params[3] || '其他', reward: params[4] || '', difficulty: params[5] || '简单',
      status: 'open', image: '', created_at: new Date().toISOString(),
    });
    return { lastInsertRowid: id };
  }

  // SELECT accepts by task and user
  if (sqlLower.includes('select id from accepts where task_id') && sqlLower.includes('and user_id')) {
    return data.accepts.find(a => a.task_id === params[0] && a.user_id === params[1]);
  }

  // INSERT accept
  if (sqlLower.includes('insert into accepts')) {
    const id = data.nextAcceptId++;
    data.accepts.push({ id, task_id: params[0], user_id: params[1], status: 'pending', created_at: new Date().toISOString() });
    return { lastInsertRowid: id };
  }

  // SELECT comments by task
  if (sqlLower.includes('from comments c') && sqlLower.includes('join users u') && sqlLower.includes('where c.task_id')) {
    let comments = data.comments.filter(c => c.task_id === params[0]);
    comments.sort((a, b) => b.id - a.id);
    return comments.map(c => {
      const user = data.users.find(u => u.id === c.user_id);
      return { ...c, username: user?.username, avatar: user?.avatar };
    });
  }

  // INSERT comment
  if (sqlLower.includes('insert into comments')) {
    const id = data.nextCommentId++;
    data.comments.push({ id, task_id: params[0], user_id: params[1], content: params[2], created_at: new Date().toISOString() });
    return { lastInsertRowid: id };
  }

  // SELECT my tasks
  if (sqlLower.includes('select * from tasks where user_id') && sqlLower.includes('order by id desc')) {
    return data.tasks.filter(t => t.user_id === params[0]).sort((a, b) => b.id - a.id);
  }

  // SELECT my accepts with join
  if (sqlLower.includes('from accepts a') && sqlLower.includes('join tasks t')) {
    let accepts = data.accepts.filter(a => a.user_id === params[0]);
    accepts.sort((a, b) => b.id - a.id);
    return accepts.map(a => {
      const task = data.tasks.find(t => t.id === a.task_id);
      const user = data.users.find(u => u.id === task?.user_id);
      return { ...task, username: user?.username, avatar: user?.avatar, accept_status: a.status, accept_time: a.created_at };
    });
  }

  // SELECT leaderboard
  if (sqlLower.includes('order by points desc') && sqlLower.includes('limit 20')) {
    return data.users
      .map(u => ({
        ...u,
        task_count: data.tasks.filter(t => t.user_id === u.id).length,
        accept_count: data.accepts.filter(a => a.user_id === u.id).length,
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 20);
  }

  // SELECT task by id (for accept check)
  if (sqlLower.includes('select * from tasks where id = ?')) {
    return data.tasks.find(t => t.id === params[0]);
  }

  return mode === 'get' ? undefined : mode === 'all' ? [] : { changes: 0 };
}

module.exports = { db, initDB };
