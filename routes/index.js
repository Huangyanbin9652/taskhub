const express = require('express');
const router = express.Router();
const { db, initDB } = require('../db/init');
const bcrypt = require('bcryptjs');

// 中间件：检查登录
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  next();
}

// 中间件：检查管理员权限
async function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: '请先登录' });
  }
  const user = await db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.user.id);
  if (!user || !user.is_admin) {
    return res.status(403).json({ error: '无管理员权限' });
  }
  next();
}

// 包装：确保数据库已初始化
async function ensureDB(req, res, next) {
  try {
    await initDB();
    next();
  } catch (e) {
    console.error('DB init error:', e.message);
    res.status(500).json({ error: '数据库初始化失败: ' + e.message });
  }
}

router.use(async (req, res, next) => {
  try {
    await initDB();
    next();
  } catch (e) {
    console.error('DB init error:', e.message);
    res.status(500).json({ error: '数据库初始化失败: ' + e.message });
  }
});

// ===== 用户认证 =====

// 注册
router.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 2 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度 2-20 个字符' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' });
    }

    const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const hashed = bcrypt.hashSync(password, 10);
    const avatars = ['🦊', '🐱', '🐶', '🐰', '🐼', '🐨', '🦁', '🐸', '🐵', '🦉', '🐧', '🐙'];
    const avatar = avatars[Math.floor(Math.random() * avatars.length)];

    const result = await db.prepare('INSERT INTO users (username, password, avatar) VALUES (?, ?, ?)').run(username, hashed, avatar);
    req.session.user = { id: result.lastInsertRowid, username, avatar, points: 0 };
    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: '注册失败: ' + e.message });
  }
});

// 登录
router.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const user = await db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: '用户名或密码错误' });
    }

    req.session.user = { id: user.id, username: user.username, avatar: user.avatar, points: user.points, is_admin: !!user.is_admin };
    res.json({ ok: true, user: req.session.user });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: '登录失败: ' + e.message });
  }
});

// 登出
router.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// 获取当前用户
router.get('/api/me', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ user: null });
    }
    const u = await db.prepare('SELECT id, username, avatar, points, bio, is_admin FROM users WHERE id = ?').get(req.session.user.id);
    if (u) {
      req.session.user.points = u.points;
      req.session.user.bio = u.bio;
      req.session.user.is_admin = !!u.is_admin;
      return res.json({ user: { ...u, is_admin: !!u.is_admin } });
    }
    res.json({ user: null });
  } catch (e) {
    console.error('Me error:', e);
    res.json({ user: null });
  }
});

// ===== 任务 CRUD =====

// 获取任务列表
router.get('/api/tasks', async (req, res) => {
  try {
    const { category, keyword } = req.query;
    let sql = `SELECT t.*, u.username, u.avatar FROM tasks t JOIN users u ON t.user_id = u.id WHERE t.status = 'open'`;
    const args = [];

    if (category && category !== '全部') {
      sql += ' AND t.category = ?';
      args.push(category);
    }
    if (keyword) {
      sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      args.push(`%${keyword}%`, `%${keyword}%`);
    }

    sql += ' ORDER BY t.id DESC';

    const tasks = await db.prepare(sql).all(...args);
    res.json({ tasks });
  } catch (e) {
    console.error('Tasks list error:', e);
    res.status(500).json({ error: '获取任务列表失败: ' + e.message });
  }
});

// 获取任务详情
router.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await db.prepare(`SELECT t.*, u.username, u.avatar FROM tasks t JOIN users u ON t.user_id = u.id WHERE t.id = ?`).get(req.params.id);

    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    // 判断当前用户是否有权查看评论：任务发布者、已接单用户、管理员
    let canViewComments = false;
    let hasAccepted = false;
    let isAdmin = false;
    
    if (req.session.user) {
      if (task.user_id === req.session.user.id) {
        canViewComments = true;
      } else {
        const accepted = await db.prepare('SELECT id FROM accepts WHERE task_id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
        if (accepted) {
          canViewComments = true;
          hasAccepted = true;
        }
      }
      const adminUser = await db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.user.id);
      if (adminUser && adminUser.is_admin) {
        canViewComments = true;
        isAdmin = true;
      }
    }

    // 只有有权查看评论的用户才能看到评论
    const comments = canViewComments 
      ? await db.prepare(`SELECT c.*, u.username, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.task_id = ? ORDER BY c.id DESC`).all(req.params.id)
      : [];

    const acceptCount = await db.prepare('SELECT COUNT(*) as count FROM accepts WHERE task_id = ?').get(req.params.id);

    res.json({ task, comments, acceptCount: acceptCount ? acceptCount.count : 0, canViewComments, hasAccepted, isAdmin });
  } catch (e) {
    console.error('Task detail error:', e);
    res.status(500).json({ error: '获取任务详情失败: ' + e.message });
  }
});

// 发布任务
router.post('/api/tasks', requireLogin, async (req, res) => {
  try {
    const { title, description, category, reward, difficulty, max_accepts } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: '标题和描述不能为空' });
    }

    const result = await db.prepare(`INSERT INTO tasks (user_id, title, description, category, reward, difficulty, max_accepts) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(req.session.user.id, title, description, category || '其他', reward || '', difficulty || '简单', max_accepts || 0);

    await db.prepare('UPDATE users SET points = points + 2 WHERE id = ?').run(req.session.user.id);

    res.json({ ok: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Publish error:', e);
    res.status(500).json({ error: '发布失败: ' + e.message });
  }
});

// 接单
router.post('/api/tasks/:id/accept', requireLogin, async (req, res) => {
  try {
    const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    if (task.status !== 'open') {
      return res.status(400).json({ error: '任务已关闭，无法接单' });
    }
    if (task.user_id === req.session.user.id) {
      return res.status(400).json({ error: '不能接自己发布的任务' });
    }

    const existing = await db.prepare('SELECT id FROM accepts WHERE task_id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
    if (existing) {
      return res.status(400).json({ error: '你已经接过这个任务了' });
    }

    // 检查人数限制：max_accepts > 0 表示限制人数
    if (task.max_accepts && task.max_accepts > 0) {
      const countResult = await db.prepare('SELECT COUNT(*) as count FROM accepts WHERE task_id = ?').get(req.params.id);
      if (countResult && countResult.count >= task.max_accepts) {
        return res.status(400).json({ error: `名额已满（限 ${task.max_accepts} 人）` });
      }
    }

    await db.prepare('INSERT INTO accepts (task_id, user_id) VALUES (?, ?)').run(req.params.id, req.session.user.id);

    // 如果设置了人数限制，接满后自动关闭任务
    if (task.max_accepts && task.max_accepts > 0) {
      const newCount = await db.prepare('SELECT COUNT(*) as count FROM accepts WHERE task_id = ?').get(req.params.id);
      if (newCount && newCount.count >= task.max_accepts) {
        await db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('closed', req.params.id);
      }
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('Accept error:', e);
    res.status(500).json({ error: '接单失败: ' + e.message });
  }
});

// 评论（只有接了任务的用户或任务发布者才能评论）
router.post('/api/tasks/:id/comments', requireLogin, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '评论内容不能为空' });
    }

    const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }

    // 检查权限：任务发布者、已接单用户、管理员
    const isOwner = task.user_id === req.session.user.id;
    const accepted = await db.prepare('SELECT id FROM accepts WHERE task_id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
    const adminUser = await db.prepare('SELECT is_admin FROM users WHERE id = ?').get(req.session.user.id);
    const isAdmin = adminUser && adminUser.is_admin;

    if (!isOwner && !accepted && !isAdmin) {
      return res.status(403).json({ error: '需要先接单才能查看和回复留言' });
    }

    await db.prepare('INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)').run(req.params.id, req.session.user.id, content.trim());

    await db.prepare('UPDATE users SET points = points + 1 WHERE id = ?').run(req.session.user.id);

    res.json({ ok: true });
  } catch (e) {
    console.error('Comment error:', e);
    res.status(500).json({ error: '评论失败: ' + e.message });
  }
});

// 获取我发布的任务
router.get('/api/my/tasks', requireLogin, async (req, res) => {
  try {
    const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY id DESC').all(req.session.user.id);
    res.json({ tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取我接的任务
router.get('/api/my/accepts', requireLogin, async (req, res) => {
  try {
    const tasks = await db.prepare(`SELECT t.*, u.username, u.avatar, a.status as accept_status, a.created_at as accept_time FROM accepts a JOIN tasks t ON a.task_id = t.id JOIN users u ON t.user_id = u.id WHERE a.user_id = ? ORDER BY a.id DESC`).all(req.session.user.id);
    res.json({ tasks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 更新个人资料
router.post('/api/profile', requireLogin, async (req, res) => {
  try {
    const { bio, avatar } = req.body;
    await db.prepare('UPDATE users SET bio = ?, avatar = ? WHERE id = ?').run(bio || '', avatar || '🦊', req.session.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 获取排行榜
router.get('/api/leaderboard', async (req, res) => {
  try {
    const users = await db.prepare(`SELECT id, username, avatar, bio, points FROM users ORDER BY points DESC LIMIT 20`).all();
    // 获取每个人的任务数和接单数
    const result = [];
    for (const u of users) {
      const tc = await db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?').get(u.id);
      const ac = await db.prepare('SELECT COUNT(*) as count FROM accepts WHERE user_id = ?').get(u.id);
      result.push({ ...u, task_count: tc ? tc.count : 0, accept_count: ac ? ac.count : 0 });
    }
    res.json({ users: result });
  } catch (e) {
    console.error('Leaderboard error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ===== 意见反馈 =====

// 提交反馈（登录/未登录都可以）
router.post('/api/feedback', async (req, res) => {
  try {
    const { content, contact } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '反馈内容不能为空' });
    }

    const userId = req.session.user ? req.session.user.id : null;
    const username = req.session.user ? req.session.user.username : '游客';

    await db.prepare('INSERT INTO feedback (user_id, username, contact, content) VALUES (?, ?, ?, ?)').run(
      userId, username, contact || '', content.trim()
    );

    res.json({ ok: true });
  } catch (e) {
    console.error('Feedback error:', e);
    res.status(500).json({ error: '提交失败: ' + e.message });
  }
});

// 查看所有反馈（仅登录用户可见）
router.get('/api/feedback', async (req, res) => {
  try {
    const feedbacks = await db.prepare('SELECT * FROM feedback ORDER BY id DESC').all();
    res.json({ feedbacks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== 管理员功能 =====

// 获取所有用户列表
router.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await db.prepare('SELECT id, username, avatar, bio, points, is_admin, created_at FROM users ORDER BY id DESC').all();
    const result = [];
    for (const u of users) {
      const tc = await db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?').get(u.id);
      result.push({ ...u, task_count: tc ? tc.count : 0 });
    }
    res.json({ users: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除用户
router.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (userId === req.session.user.id) {
      return res.status(400).json({ error: '不能删除自己' });
    }
    // 检查目标用户是否是管理员
    const targetUser = await db.prepare('SELECT is_admin FROM users WHERE id = ?').get(userId);
    if (targetUser && targetUser.is_admin) {
      return res.status(400).json({ error: '不能删除管理员账号' });
    }
    // 删除用户相关数据
    await db.prepare('DELETE FROM comments WHERE user_id = ?').run(userId);
    await db.prepare('DELETE FROM accepts WHERE user_id = ?').run(userId);
    await db.prepare('DELETE FROM tasks WHERE user_id = ?').run(userId);
    await db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除任务
router.delete('/api/admin/tasks/:id', requireAdmin, async (req, res) => {
  try {
    const taskId = Number(req.params.id);
    await db.prepare('DELETE FROM comments WHERE task_id = ?').run(taskId);
    await db.prepare('DELETE FROM accepts WHERE task_id = ?').run(taskId);
    await db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除反馈
router.delete('/api/admin/feedback/:id', requireAdmin, async (req, res) => {
  try {
    await db.prepare('DELETE FROM feedback WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
