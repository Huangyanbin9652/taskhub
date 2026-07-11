// ===== TaskHub Frontend =====

const API = {
  get: (url) => fetch(url).then(r => r.json()),
  post: (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json())
};

// State
let currentUser = null;
let currentPage = 'home';
let currentCategory = '全部';
let currentKeyword = '';

// ===== Init =====
async function init() {
  const res = await API.get('/api/me');
  currentUser = res.user;
  render();
}

// ===== Toast =====
function toast(msg) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ===== Router =====
function navigate(page, params = {}) {
  currentPage = page;
  window.scrollTo(0, 0);
  render(params);
}

// ===== Render =====
function render(params = {}) {
  const app = document.getElementById('app');
  
  // Header
  let html = `
    <div class="header">
      <div class="logo" onclick="navigate('home')"><span>🎯</span> TaskHub</div>
      <button class="user-btn" onclick="navigate('${currentUser ? 'profile' : 'auth'}')">
        ${currentUser ? currentUser.avatar : '👤'}
      </button>
    </div>
  `;

  // Page content
  html += `<div class="page" id="page-content">${renderPage(params)}</div>`;

  // Tab bar
  html += `
    <div class="tabbar">
      <button class="${currentPage === 'home' ? 'active' : ''}" onclick="navigate('home')">
        <span class="tab-icon">🏠</span>首页
      </button>
      <button class="${currentPage === 'publish' ? 'active' : ''}" onclick="navigate('publish')">
        <span class="tab-icon">➕</span>发布
      </button>
      <button class="${currentPage === 'leaderboard' ? 'active' : ''}" onclick="navigate('leaderboard')">
        <span class="tab-icon">🏆</span>排行
      </button>
      <button class="${currentPage === 'profile' || currentPage === 'auth' ? 'active' : ''}" onclick="navigate('${currentUser ? 'profile' : 'auth'}')">
        <span class="tab-icon">${currentUser ? currentUser.avatar : '👤'}</span>${currentUser ? '我的' : '登录'}
      </button>
    </div>
  `;

  app.innerHTML = html;
  bindPageEvents();
}

function renderPage(params) {
  switch (currentPage) {
    case 'home': return renderHome();
    case 'publish': return renderPublish();
    case 'leaderboard': return renderLeaderboard();
    case 'profile': return renderProfile();
    case 'auth': return renderAuth();
    case 'detail': return renderDetail(params.id);
    case 'my-tasks': return renderMyTasks();
    case 'my-accepts': return renderMyAccepts();
    default: return renderHome();
  }
}

// ===== Home Page =====
function renderHome() {
  return `
    <div class="hero">
      <h1>🎯 发现有趣任务</h1>
      <p>接单做任务赚积分，或发布你的创意挑战</p>
    </div>
    <div class="search-box">
      <input type="text" id="search-input" placeholder="搜索任务..." value="${currentKeyword}">
      <button onclick="searchTasks()">搜索</button>
    </div>
    <div class="categories" id="categories">
      ${['全部','摄影','挑战','创意','探索','写作','运动','生活','其他'].map(c => 
        `<button class="chip ${currentCategory === c ? 'active' : ''}" onclick="selectCategory('${c}')">${c}</button>`
      ).join('')}
    </div>
    <div id="task-list">
      <div class="empty"><div class="emoji">⏳</div><p>加载中...</p></div>
    </div>
  `;
}

async function loadTasks() {
  let url = `/api/tasks?category=${encodeURIComponent(currentCategory)}`;
  if (currentKeyword) url += `&keyword=${encodeURIComponent(currentKeyword)}`;
  const res = await API.get(url);
  const list = document.getElementById('task-list');
  
  if (!res.tasks || res.tasks.length === 0) {
    list.innerHTML = `<div class="empty"><div class="emoji">📭</div><p>暂无任务，去发布第一个吧！</p></div>`;
    return;
  }

  list.innerHTML = `<div class="task-grid">${res.tasks.map(t => taskCardHTML(t)).join('')}</div>`;
}

function taskCardHTML(t) {
  const diffMap = { '简单': 'easy', '中等': 'medium', '困难': 'hard' };
  const diffClass = diffMap[t.difficulty] || 'easy';
  return `
    <div class="task-card" onclick="navigate('detail', {id: ${t.id}})">
      <div class="tc-header">
        <div class="tc-author">
          <span class="avatar">${t.avatar}</span>
          <span>${t.username}</span>
        </div>
      </div>
      <div class="tc-title">${escapeHTML(t.title)}</div>
      <div class="tc-desc">${escapeHTML(t.description)}</div>
      <div class="tc-footer">
        <span class="tag tag-cat">${t.category}</span>
        <span class="tag tag-difficulty-${diffClass}">${t.difficulty}</span>
        ${t.reward ? `<span class="tag tag-reward">🎁 ${t.reward}</span>` : ''}
      </div>
    </div>
  `;
}

function selectCategory(cat) {
  currentCategory = cat;
  render();
  loadTasks();
}

function searchTasks() {
  currentKeyword = document.getElementById('search-input').value.trim();
  loadTasks();
}

// ===== Detail Page =====
function renderDetail(id) {
  return `
    <div class="detail-back" onclick="navigate('home')">← 返回</div>
    <div id="detail-content">
      <div class="empty"><div class="emoji">⏳</div><p>加载中...</p></div>
    </div>
  `;
}

async function loadDetail(id) {
  const res = await API.get(`/api/tasks/${id}`);
  const el = document.getElementById('detail-content');
  
  if (res.error) {
    el.innerHTML = `<div class="empty"><div class="emoji">😅</div><p>${res.error}</p></div>`;
    return;
  }

  const t = res.task;
  const diffMap = { '简单': 'easy', '中等': 'medium', '困难': 'hard' };
  const diffClass = diffMap[t.difficulty] || 'easy';

  el.innerHTML = `
    <div class="detail-card">
      <h1>${escapeHTML(t.title)}</h1>
      <div class="detail-meta">
        <span class="tag tag-cat">${t.category}</span>
        <span class="tag tag-difficulty-${diffClass}">${t.difficulty}</span>
        ${t.reward ? `<span class="tag tag-reward">🎁 ${t.reward}</span>` : ''}
      </div>
      <div class="detail-desc">${escapeHTML(t.description).replace(/\n/g, '<br>')}</div>
      <div class="detail-author">
        <span class="avatar">${t.avatar}</span>
        <div class="info">
          <div class="name">${t.username}</div>
          <div class="time">发布于 ${formatTime(t.created_at)}</div>
        </div>
      </div>
      <div style="text-align:center; padding:8px 0 4px; font-size:0.8rem; color:var(--text-lighter);">
        👥 ${res.acceptCount} 人已接单
      </div>
      ${currentUser ? `
        ${t.user_id === currentUser.id ? `
          <div style="color:var(--text-light); text-align:center; font-size:0.85rem; margin-top:8px;">这是你发布的任务</div>
        ` : `
          <button class="btn btn-primary" style="margin-top:16px;" onclick="acceptTask(${t.id})">🤝 我来接单</button>
        `}
      ` : `
        <button class="btn btn-outline" style="margin-top:16px;" onclick="navigate('auth')">登录后接单</button>
      `}
    </div>

    <div class="comments-section">
      <h3>💬 评论 (${res.comments.length})</h3>
      ${res.comments.map(c => `
        <div class="comment-item">
          <span class="avatar">${c.avatar}</span>
          <div class="c-body">
            <div class="c-name">${c.username} <span class="c-time">· ${formatTime(c.created_at)}</span></div>
            <div class="c-text">${escapeHTML(c.content)}</div>
          </div>
        </div>
      `).join('') || '<p style="color:var(--text-lighter); font-size:0.85rem; padding:8px 0;">暂无评论，来说点什么吧</p>'}
      
      ${currentUser ? `
        <div class="comment-form">
          <input type="text" id="comment-input" placeholder="说点什么..." maxlength="200">
          <button onclick="submitComment(${t.id})">发送</button>
        </div>
      ` : ''}
    </div>
  `;
}

async function acceptTask(id) {
  const res = await API.post(`/api/tasks/${id}/accept`, {});
  if (res.error) {
    toast(res.error);
  } else {
    toast('✅ 接单成功！');
    loadDetail(id);
  }
}

async function submitComment(taskId) {
  const input = document.getElementById('comment-input');
  const content = input.value.trim();
  if (!content) return;

  const res = await API.post(`/api/tasks/${taskId}/comments`, { content });
  if (res.error) {
    toast(res.error);
  } else {
    toast('💬 评论成功 +1积分');
    loadDetail(taskId);
  }
}

// ===== Publish Page =====
function renderPublish() {
  if (!currentUser) {
    return `
      <div class="empty" style="padding-top:80px;">
        <div class="emoji">🔐</div>
        <p>请先登录后发布任务</p>
        <button class="btn btn-primary" style="max-width:200px; margin:16px auto 0;" onclick="navigate('auth')">去登录</button>
      </div>
    `;
  }

  const avatars = ['🦊','🐱','🐶','🐰','🐼','🐨','🦁','🐸','🐵','🦉','🐧','🐙'];

  return `
    <div style="padding-top:8px;">
      <h2 style="font-size:1.2rem; margin-bottom:16px;">✨ 发布一个有趣任务</h2>
      <div class="form-group">
        <label>任务标题</label>
        <input type="text" id="pub-title" placeholder="例如：拍一张日落照片" maxlength="50">
      </div>
      <div class="form-group">
        <label>任务描述</label>
        <textarea id="pub-desc" placeholder="详细描述任务要求和规则..." maxlength="500"></textarea>
      </div>
      <div class="form-group">
        <label>分类</label>
        <select id="pub-category">
          ${['摄影','挑战','创意','探索','写作','运动','生活','其他'].map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>奖励</label>
        <input type="text" id="pub-reward" placeholder="例如：10 积分" maxlength="30">
      </div>
      <div class="form-group">
        <label>难度</label>
        <div class="diff-selector">
          ${['简单','中等','困难'].map((d,i) => `
            <button class="${i===0?'selected':''}" onclick="selectDiff(this,'${d}')">${d}</button>
          `).join('')}
        </div>
      </div>
      <button class="btn btn-primary" onclick="publishTask()">🚀 发布任务</button>
    </div>
  `;
}

let selectedDifficulty = '简单';

function selectDiff(btn, diff) {
  selectedDifficulty = diff;
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

async function publishTask() {
  const title = document.getElementById('pub-title').value.trim();
  const desc = document.getElementById('pub-desc').value.trim();
  const category = document.getElementById('pub-category').value;
  const reward = document.getElementById('pub-reward').value.trim();

  if (!title || !desc) {
    toast('标题和描述不能为空');
    return;
  }

  const res = await API.post('/api/tasks', { title, description: desc, category, reward, difficulty: selectedDifficulty });
  if (res.error) {
    toast(res.error);
  } else {
    toast('🎉 发布成功 +2积分！');
    navigate('home');
    setTimeout(() => loadTasks(), 100);
  }
}

// ===== Leaderboard =====
function renderLeaderboard() {
  return `<div id="lb-content"><div class="empty"><div class="emoji">⏳</div><p>加载中...</p></div></div>`;
}

async function loadLeaderboard() {
  const res = await API.get('/api/leaderboard');
  const el = document.getElementById('lb-content');
  
  if (!res.users || res.users.length === 0) {
    el.innerHTML = `<div class="empty"><div class="emoji">🏆</div><p>暂无排行数据</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="hero"><h1>🏆 积分排行榜</h1><p>完成任务、发布任务、评论都能赚积分</p></div>
    ${res.users.map((u, i) => `
      <div class="lb-item">
        <span class="rank rank-${i+1 <= 3 ? i+1 : ''}">${i+1 <= 3 ? ['🥇','🥈','🥉'][i] : i+1}</span>
        <span class="avatar">${u.avatar}</span>
        <div class="info">
          <div class="name">${u.username}</div>
          <div class="pts">发布 ${u.task_count} · 接单 ${u.accept_count}</div>
        </div>
        <span class="points">${u.points} 分</span>
      </div>
    `).join('')}
  `;
}

// ===== Profile =====
function renderProfile() {
  if (!currentUser) return renderAuth();

  const avatars = ['🦊','🐱','🐶','🐰','🐼','🐨','🦁','🐸','🐵','🦉','🐧','🐙'];

  return `
    <div class="profile-header">
      <div class="avatar">${currentUser.avatar}</div>
      <h2>${currentUser.username}</h2>
      <p>${currentUser.bio || '这个人很懒，什么都没留下'}</p>
    </div>
    <div class="profile-stats">
      <div class="stat"><div class="num" id="stat-points">${currentUser.points || 0}</div><div class="label">积分</div></div>
      <div class="stat"><div class="num" id="stat-tasks">-</div><div class="label">发布</div></div>
      <div class="stat"><div class="num" id="stat-accepts">-</div><div class="label">接单</div></div>
    </div>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="navigate('my-tasks')">📋 我发布的任务</button>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="navigate('my-accepts')">🤝 我接的任务</button>
    <button class="btn btn-outline" style="margin-bottom:16px;" onclick="toggleEditProfile()">✏️ 编辑资料</button>
    <div id="edit-profile" style="display:none; margin-bottom:16px;">
      <div class="form-group">
        <label>选择头像</label>
        <div class="avatar-picker" id="avatar-picker">
          ${avatars.map(a => `<button class="${a===currentUser.avatar?'selected':''}" onclick="pickAvatar(this,'${a}')">${a}</button>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>个人简介</label>
        <textarea id="edit-bio" placeholder="介绍一下自己..." maxlength="100">${currentUser.bio || ''}</textarea>
      </div>
      <button class="btn btn-primary" onclick="saveProfile()">保存</button>
    </div>
    <button class="btn btn-danger" onclick="logout()">退出登录</button>
  `;
}

let pickedAvatar = '';

function toggleEditProfile() {
  const el = document.getElementById('edit-profile');
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
  pickedAvatar = currentUser.avatar;
}

function pickAvatar(btn, avatar) {
  pickedAvatar = avatar;
  document.querySelectorAll('#avatar-picker button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

async function saveProfile() {
  const bio = document.getElementById('edit-bio').value.trim();
  const res = await API.post('/api/profile', { bio, avatar: pickedAvatar });
  if (res.ok) {
    toast('✅ 保存成功');
    const me = await API.get('/api/me');
    currentUser = me.user;
    render();
  }
}

async function loadProfileStats() {
  const [myTasks, myAccepts] = await Promise.all([
    API.get('/api/my/tasks'),
    API.get('/api/my/accepts')
  ]);
  const tEl = document.getElementById('stat-tasks');
  const aEl = document.getElementById('stat-accepts');
  if (tEl) tEl.textContent = myTasks.tasks ? myTasks.tasks.length : 0;
  if (aEl) aEl.textContent = myAccepts.tasks ? myAccepts.tasks.length : 0;
}

// ===== My Tasks =====
function renderMyTasks() {
  if (!currentUser) return renderAuth();
  return `
    <div class="detail-back" onclick="navigate('profile')">← 返回</div>
    <h2 style="font-size:1.15rem; margin-bottom:14px;">📋 我发布的任务</h2>
    <div id="my-tasks-list"><div class="empty"><div class="emoji">⏳</div><p>加载中...</p></div></div>
  `;
}

async function loadMyTasks() {
  const res = await API.get('/api/my/tasks');
  const el = document.getElementById('my-tasks-list');
  if (!res.tasks || res.tasks.length === 0) {
    el.innerHTML = `<div class="empty"><div class="emoji">📭</div><p>还没有发布过任务</p></div>`;
    return;
  }
  el.innerHTML = res.tasks.map(t => taskCardHTML(t)).join('');
}

// ===== My Accepts =====
function renderMyAccepts() {
  if (!currentUser) return renderAuth();
  return `
    <div class="detail-back" onclick="navigate('profile')">← 返回</div>
    <h2 style="font-size:1.15rem; margin-bottom:14px;">🤝 我接的任务</h2>
    <div id="my-accepts-list"><div class="empty"><div class="emoji">⏳</div><p>加载中...</p></div></div>
  `;
}

async function loadMyAccepts() {
  const res = await API.get('/api/my/accepts');
  const el = document.getElementById('my-accepts-list');
  if (!res.tasks || res.tasks.length === 0) {
    el.innerHTML = `<div class="empty"><div class="emoji">📭</div><p>还没有接单</p></div>`;
    return;
  }
  el.innerHTML = res.tasks.map(t => taskCardHTML(t)).join('');
}

// ===== Auth Page =====
function renderAuth() {
  if (currentUser) return renderProfile();
  return `
    <div class="auth-card">
      <h2>${authMode === 'login' ? '👋 欢迎回来' : '🎉 加入 TaskHub'}</h2>
      <div class="auth-error" id="auth-error"></div>
      <div class="form-group">
        <label>用户名</label>
        <input type="text" id="auth-username" placeholder="2-20个字符" maxlength="20">
      </div>
      <div class="form-group">
        <label>密码</label>
        <input type="password" id="auth-password" placeholder="至少6位" maxlength="50">
      </div>
      <button class="btn btn-primary" onclick="doAuth()">${authMode === 'login' ? '登录' : '注册'}</button>
      <div class="switch-auth">
        ${authMode === 'login' ? '没有账号？' : '已有账号？'}
        <a href="javascript:void(0)" onclick="switchAuthMode()">${authMode === 'login' ? '去注册' : '去登录'}</a>
      </div>
    </div>
    <div style="text-align:center; margin-top:20px; font-size:0.8rem; color:var(--text-lighter);">
      💡 体验账号：demo / 123456
    </div>
  `;
}

let authMode = 'login';

function switchAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  render();
}

async function doAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const errEl = document.getElementById('auth-error');

  if (!username || !password) {
    errEl.textContent = '请填写用户名和密码';
    return;
  }

  const res = await API.post(`/api/${authMode}`, { username, password });
  if (res.error) {
    errEl.textContent = res.error;
  } else {
    currentUser = res.user;
    toast(authMode === 'login' ? '👋 登录成功' : '🎉 注册成功');
    navigate('home');
    setTimeout(() => loadTasks(), 100);
  }
}

async function logout() {
  await API.post('/api/logout', {});
  currentUser = null;
  toast('已退出登录');
  navigate('home');
  setTimeout(() => loadTasks(), 100);
}

// ===== Utils =====
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatTime(time) {
  if (!time) return '';
  const d = new Date(time + 'Z');
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff/60) + '分钟前';
  if (diff < 86400) return Math.floor(diff/3600) + '小时前';
  if (diff < 2592000) return Math.floor(diff/86400) + '天前';
  return d.toLocaleDateString('zh-CN');
}

// ===== Bind page events =====
function bindPageEvents() {
  switch (currentPage) {
    case 'home': loadTasks(); break;
    case 'detail': 
      const id = new URLSearchParams(window.location.search).get('id');
      // 从 navigate params 获取
      const pageEl = document.getElementById('page-content');
      // 使用 data 属性
      break;
    case 'leaderboard': loadLeaderboard(); break;
    case 'profile': 
      if (currentUser) loadProfileStats();
      break;
    case 'my-tasks': loadMyTasks(); break;
    case 'my-accepts': loadMyAccepts(); break;
  }
}

// Patch navigate to handle detail with id
const _origNavigate = navigate;
navigate = function(page, params = {}) {
  currentPage = page;
  if (page === 'detail' && params.id) {
    window.scrollTo(0, 0);
    render(params);
    setTimeout(() => loadDetail(params.id), 50);
  } else {
    window.scrollTo(0, 0);
    render(params);
    bindPageEvents();
  }
};

// Init
init();
