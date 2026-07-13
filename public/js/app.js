// ===== TaskHub Frontend =====

const API = {
  get: (url) => fetch(url).then(r => r.json()),
  post: (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json()),
  del: (url) => fetch(url, { method: 'DELETE' }).then(r => r.json())
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
  let pageContent = renderPage(params);
  // 在非协议页面底部添加法律声明
  if (currentPage !== 'terms') {
    pageContent += `
      <div style="margin-top:30px; padding-top:16px; border-top:1px solid var(--border); text-align:center; font-size:0.72rem; color:var(--text-lighter); line-height:1.7;">
        <p>本平台仅提供技术服务，不对用户发布内容承担责任</p>
        <p>用户行为由其个人承担法律责任 · <a href="javascript:void(0)" onclick="navigate('terms')" style="color:var(--text-lighter); text-decoration:underline;">用户协议与免责声明</a></p>
        <p>© 2026 TaskHub · dotask.help</p>
      </div>
    `;
  }
  html += `<div class="page" id="page-content">${pageContent}</div>`;

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
    case 'feedback': return renderFeedback();
    case 'feedback-list': return renderFeedbackList();
    case 'terms': return renderTerms();
    case 'admin': return renderAdmin();
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
    <div style="text-align:right; margin-bottom:10px;">
      <a href="javascript:void(0)" onclick="navigate('feedback')" style="font-size:0.82rem; color:var(--primary);">💬 意见反馈</a>
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
  const isClosed = t.status === 'closed';
  const maxAcceptsTag = t.max_accepts > 0 
    ? `<span class="tag ${isClosed ? 'tag-difficulty-hard' : 'tag-difficulty-medium'}">${isClosed ? '🔒 已满' : `👤 限${t.max_accepts}人`}</span>`
    : '';
  return `
    <div class="task-card" onclick="navigate('detail', {id: ${t.id}})">
      <div class="tc-header">
        <div class="tc-author">
          <span class="avatar">${t.avatar}</span>
          <span>${t.username}</span>
        </div>
        ${isClosed ? '<span class="tag tag-difficulty-hard" style="font-size:0.7rem;">已关闭</span>' : ''}
      </div>
      <div class="tc-title">${escapeHTML(t.title)}</div>
      <div class="tc-desc">${escapeHTML(t.description)}</div>
      <div class="tc-footer">
        <span class="tag tag-cat">${t.category}</span>
        <span class="tag tag-difficulty-${diffClass}">${t.difficulty}</span>
        ${t.reward ? `<span class="tag tag-reward">🎁 ${t.reward}</span>` : ''}
        ${maxAcceptsTag}
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
        👥 ${res.acceptCount} 人已接单${t.max_accepts > 0 ? ` / 限 ${t.max_accepts} 人` : '（不限制）'}
      </div>
      ${currentUser ? `
        ${t.user_id === currentUser.id ? `
          <div style="color:var(--text-light); text-align:center; font-size:0.85rem; margin-top:8px;">这是你发布的任务</div>
        ` : res.hasAccepted ? `
          <div style="color:var(--success); text-align:center; font-size:0.85rem; margin-top:8px;">✅ 你已接单</div>
        ` : t.status === 'closed' ? `
          <div style="color:var(--danger); text-align:center; font-size:0.85rem; margin-top:8px;">🔒 名额已满，无法接单</div>
        ` : `
          <button class="btn btn-primary" style="margin-top:16px;" onclick="acceptTask(${t.id})">🤝 我来接单</button>
        `}
      ` : t.status === 'closed' ? `
        <div style="color:var(--danger); text-align:center; font-size:0.85rem; margin-top:8px;">🔒 名额已满</div>
      ` : `
        <button class="btn btn-outline" style="margin-top:16px;" onclick="navigate('auth')">登录后接单</button>
      `}
    </div>

    ${res.canViewComments ? `
      <div class="comments-section">
        <h3>💬 留言 (${res.comments.length})</h3>
        ${res.comments.map(c => `
          <div class="comment-item">
            <span class="avatar">${c.avatar}</span>
            <div class="c-body">
              <div class="c-name">${c.username} <span class="c-time">· ${formatTime(c.created_at)}</span></div>
              <div class="c-text">${escapeHTML(c.content)}</div>
            </div>
          </div>
        `).join('') || '<p style="color:var(--text-lighter); font-size:0.85rem; padding:8px 0;">暂无留言，来说点什么吧</p>'}
        
        ${currentUser ? `
          <div class="comment-form">
            <input type="text" id="comment-input" placeholder="说点什么..." maxlength="200">
            <button onclick="submitComment(${t.id})">发送</button>
          </div>
        ` : ''}
      </div>
    ` : `
      <div class="comments-section">
        <h3>💬 留言区</h3>
        <div class="empty" style="padding:30px 20px;">
          <div class="emoji">🔒</div>
          <p style="font-size:0.85rem;">接单后才能查看和回复留言</p>
        </div>
      </div>
    `}
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
      <div class="form-group">
        <label>接单人数限制</label>
        <div class="diff-selector">
          <button class="selected" onclick="selectMaxAccepts(this, 0)">不限制</button>
          <button onclick="selectMaxAccepts(this, 1)">仅1人</button>
          <button onclick="selectMaxAccepts(this, 3)">限3人</button>
          <button onclick="selectMaxAccepts(this, 5)">限5人</button>
        </div>
        <p style="font-size:0.78rem; color:var(--text-lighter); margin-top:6px;">限制人数后，名额满将自动关闭任务</p>
      </div>
      <button class="btn btn-primary" onclick="publishTask()">🚀 发布任务</button>
    </div>
  `;
}

let selectedDifficulty = '简单';
let selectedMaxAccepts = 0;

function selectDiff(btn, diff) {
  selectedDifficulty = diff;
  btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function selectMaxAccepts(btn, max) {
  selectedMaxAccepts = max;
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

  const res = await API.post('/api/tasks', { title, description: desc, category, reward, difficulty: selectedDifficulty, max_accepts: selectedMaxAccepts });
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
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="navigate('feedback')">💬 意见反馈</button>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="navigate('feedback-list')">📥 查看反馈</button>
    ${currentUser.is_admin ? `
      <button class="btn btn-primary" style="margin-bottom:12px;" onclick="navigate('admin')">⚙️ 管理后台</button>
    ` : ''}
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
      ${authMode === 'register' ? `
        <div style="margin-bottom:16px; font-size:0.82rem; color:var(--text-light); line-height:1.6;">
          <label style="display:flex; gap:8px; align-items:flex-start; cursor:pointer;">
            <input type="checkbox" id="agree-terms" style="margin-top:3px; width:auto;">
            <span>我已阅读并同意 <a href="javascript:void(0)" onclick="navigate('terms')" style="color:var(--primary); font-weight:600;">《用户协议与免责声明》</a></span>
          </label>
        </div>
      ` : ''}
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

  if (authMode === 'register') {
    const agree = document.getElementById('agree-terms');
    if (!agree || !agree.checked) {
      errEl.textContent = '请先阅读并同意《用户协议与免责声明》';
      return;
    }
  }

  const res = await API.post(`/api/${authMode}`, { username, password });
  if (res.error) {
    errEl.textContent = res.error;
  } else {
    currentUser = res.user;
    if (authMode === 'login' && res.welcome) {
      showWelcome(res.welcome, res.user);
    } else {
      toast('🎉 注册成功，欢迎加入！');
    }
    navigate('home');
    setTimeout(() => loadTasks(), 100);
  }
}

// 欢迎弹窗
function showWelcome(msg, user) {
  const old = document.querySelector('.welcome-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.className = 'welcome-modal';
  modal.innerHTML = `
    <div class="welcome-overlay" onclick="this.parentElement.remove()"></div>
    <div class="welcome-box">
      <div class="welcome-avatar">${user.avatar || '👋'}</div>
      <p class="welcome-text">${escapeHTML(msg)}</p>
      <button class="btn btn-primary" style="max-width:160px; margin:0 auto;" onclick="this.closest('.welcome-modal').remove()">开始探索</button>
    </div>
  `;
  document.body.appendChild(modal);
  // 5秒后自动消失
  setTimeout(() => { if (modal.parentElement) modal.remove(); }, 5000);
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
    case 'feedback-list': loadFeedbackList(); break;
    case 'admin': loadAdminUsers(); break;
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

// ===== Feedback =====
function renderFeedback() {
  return `
    <div class="detail-back" onclick="navigate('home')">← 返回</div>
    <h2 style="font-size:1.2rem; margin-bottom:6px;">💬 意见反馈</h2>
    <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:16px;">有任何建议、bug 反馈或功能想法，欢迎告诉我！</p>
    <div class="form-group">
      <label>反馈内容 <span style="color:var(--text-lighter);">(必填)</span></label>
      <textarea id="fb-content" placeholder="请描述你的建议或问题..." maxlength="500" style="min-height:120px;"></textarea>
    </div>
    <div class="form-group">
      <label>联系方式 <span style="color:var(--text-lighter);">(选填)</span></label>
      <input type="text" id="fb-contact" placeholder="邮箱或微信，方便我回复你" maxlength="50">
    </div>
    <button class="btn btn-primary" onclick="submitFeedback()">📤 提交反馈</button>
  `;
}

async function submitFeedback() {
  const content = document.getElementById('fb-content').value.trim();
  const contact = document.getElementById('fb-contact').value.trim();

  if (!content) {
    toast('请填写反馈内容');
    return;
  }

  const res = await API.post('/api/feedback', { content, contact });
  if (res.error) {
    toast(res.error);
  } else {
    toast('✅ 感谢你的反馈！');
    setTimeout(() => navigate('home'), 1500);
  }
}

function renderFeedbackList() {
  if (!currentUser) {
    return `<div class="empty" style="padding-top:80px;"><div class="emoji">🔐</div><p>请先登录后查看</p><button class="btn btn-primary" style="max-width:200px; margin:16px auto 0;" onclick="navigate('auth')">去登录</button></div>`;
  }
  return `
    <div class="detail-back" onclick="navigate('profile')">← 返回</div>
    <h2 style="font-size:1.15rem; margin-bottom:14px;">📥 用户反馈列表</h2>
    <div id="fb-list"><div class="empty"><div class="emoji">⏳</div><p>加载中...</p></div></div>
  `;
}

async function loadFeedbackList() {
  const res = await API.get('/api/feedback');
  const el = document.getElementById('fb-list');
  if (!res.feedbacks || res.feedbacks.length === 0) {
    el.innerHTML = `<div class="empty"><div class="emoji">📭</div><p>暂无反馈</p></div>`;
    return;
  }
  el.innerHTML = res.feedbacks.map(f => `
    <div class="task-card">
      <div class="tc-author" style="margin-bottom:8px;">
        <span class="avatar">💬</span>
        <span><strong>${escapeHTML(f.username)}</strong></span>
        <span style="color:var(--text-lighter); font-size:0.78rem;">· ${formatTime(f.created_at)}</span>
      </div>
      <div style="font-size:0.9rem; line-height:1.6; margin-bottom:8px;">${escapeHTML(f.content).replace(/\n/g, '<br>')}</div>
      ${f.contact ? `<div style="font-size:0.8rem; color:var(--text-light);">📞 ${escapeHTML(f.contact)}</div>` : ''}
    </div>
  `).join('');
}

// ===== Terms / 用户协议 =====
function renderTerms() {
  return `
    <div class="detail-back" onclick="navigate('auth')">← 返回</div>
    <div class="detail-card">
      <h1 style="font-size:1.2rem; text-align:center; margin-bottom:4px;">用户协议与免责声明</h1>
      <p style="text-align:center; font-size:0.78rem; color:var(--text-lighter); margin-bottom:20px;">更新日期：2026年7月12日</p>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">一、服务说明</h3>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        TaskHub（以下简称"本平台"）是一个有趣任务发布与接单的社区平台。本平台提供信息发布、交流互动等服务，用户可以在平台上发布任务、接受任务、评论互动。
      </p>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">二、用户行为规范</h3>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">用户在使用本平台时，应遵守中华人民共和国相关法律法规，不得发布、传播以下内容：</p>
      <ul style="font-size:0.85rem; color:var(--text); line-height:1.8; padding-left:20px; margin:8px 0;">
        <li>反对宪法所确定的基本原则的；</li>
        <li>危害国家安全、泄露国家秘密、颠覆国家政权、破坏国家统一的；</li>
        <li>损害国家荣誉和利益的；</li>
        <li>煽动民族仇恨、民族歧视，破坏民族团结的；</li>
        <li>破坏国家宗教政策，宣扬邪教和封建迷信的；</li>
        <li>散布谣言，扰乱社会秩序，破坏社会稳定的；</li>
        <li>散布淫秽、色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的；</li>
        <li>侮辱或者诽谤他人，侵害他人合法权益的；</li>
        <li>含有法律、行政法规禁止的其他内容的。</li>
      </ul>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">三、免责声明</h3>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        1. 本平台仅为用户提供信息发布与交流的技术服务，不对用户发布的内容进行逐一审查。用户对其发布的内容承担全部法律责任。
      </p>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        2. 因用户发布的内容引起的任何法律纠纷、损失或损害，均由发布该内容的用户自行承担全部责任，本平台不承担任何连带责任。
      </p>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        3. 本平台有权但无义务对用户发布的内容进行审核，发现违规内容时可不经通知予以删除，并视情节轻重对违规用户采取警告、封禁等措施。
      </p>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        4. 用户间的任务交易、互动等行为属用户个人行为，本平台不参与、不担保，由此产生的纠纷由用户自行解决。
      </p>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">四、知识产权</h3>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        用户发布的内容，知识产权归原作者所有。用户发布内容即视为同意授予本平台在平台内展示、使用该内容的非排他性许可。
      </p>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">五、隐私保护</h3>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        本平台尊重用户隐私，不会主动向第三方泄露用户的注册信息。但根据法律法规或政府部门的强制性要求，本平台有可能披露用户相关信息。
      </p>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">六、协议修改</h3>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        本平台有权随时修改本协议，修改后的协议一经公布即替代原协议。用户继续使用本平台即视为同意修改后的协议。
      </p>

      <h3 style="font-size:0.95rem; margin:16px 0 8px;">七、联系方式</h3>
      <p style="font-size:0.85rem; color:var(--text); line-height:1.8;">
        如对本协议有任何疑问，可通过"意见反馈"功能联系我们。
      </p>

      <div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--border); text-align:center;">
        <button class="btn btn-primary" style="max-width:200px; margin:0 auto;" onclick="navigate('auth')">我已阅读，返回注册</button>
      </div>
    </div>
  `;
}

// ===== Admin 管理后台 =====
function renderAdmin() {
  if (!currentUser || !currentUser.is_admin) {
    return `<div class="empty" style="padding-top:80px;"><div class="emoji">⛔</div><p>无管理员权限</p></div>`;
  }
  return `
    <div class="detail-back" onclick="navigate('profile')">← 返回</div>
    <h2 style="font-size:1.2rem; margin-bottom:6px;">⚙️ 管理后台</h2>
    <p style="font-size:0.85rem; color:var(--text-light); margin-bottom:16px;">管理用户、任务和反馈</p>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="loadAdminUsers()">👥 用户管理</button>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="loadAdminTasks()">📋 任务管理</button>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="loadAdminFeedback()">📥 反馈管理</button>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="loadAdminLoginStats()">📊 登录统计</button>
    <button class="btn btn-outline" style="margin-bottom:12px;" onclick="loadAdminLoginLogs()">📝 登录日志</button>
    <div id="admin-content" style="margin-top:16px;"></div>
  `;
}

async function loadAdminUsers() {
  const res = await API.get('/api/admin/users');
  const el = document.getElementById('admin-content');
  if (!el) return;
  if (res.error) { el.innerHTML = `<p style="color:var(--danger);">${res.error}</p>`; return; }
  el.innerHTML = `
    <h3 style="font-size:1rem; margin-bottom:12px;">👥 用户列表 (${res.users.length})</h3>
    ${res.users.map(u => `
      <div class="task-card" style="padding:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.5rem;">${u.avatar}</span>
          <div style="flex:1;">
            <div style="font-weight:600;">${escapeHTML(u.username)} ${u.is_admin ? '<span class="tag tag-reward" style="font-size:0.7rem;">管理员</span>' : ''}</div>
            <div style="font-size:0.78rem; color:var(--text-light);">${u.points} 积分 · 发布 ${u.task_count} 任务 · ${formatTime(u.created_at)}</div>
          </div>
          ${!u.is_admin ? `<button class="btn btn-danger" style="width:auto; padding:6px 12px; font-size:0.78rem;" onclick="deleteUser(${u.id}, '${escapeHTML(u.username)}')">删除</button>` : ''}
        </div>
      </div>
    `).join('')}
  `;
}

async function deleteUser(id, name) {
  if (!confirm(`确定删除用户「${name}」？此操作会删除其所有任务和评论，不可恢复。`)) return;
  const res = await API.del(`/api/admin/users/${id}`);
  if (res.error) { toast(res.error); return; }
  toast('✅ 已删除用户');
  loadAdminUsers();
}

async function loadAdminTasks() {
  const res = await API.get('/api/tasks');
  const el = document.getElementById('admin-content');
  if (!el) return;
  el.innerHTML = `
    <h3 style="font-size:1rem; margin-bottom:12px;">📋 任务列表 (${res.tasks.length})</h3>
    ${res.tasks.map(t => `
      <div class="task-card" style="padding:12px;">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <div style="flex:1;">
            <div style="font-weight:600; font-size:0.95rem;">${escapeHTML(t.title)}</div>
            <div style="font-size:0.78rem; color:var(--text-light); margin-top:4px;">${t.username} · ${t.category} · ${t.difficulty}</div>
          </div>
          <button class="btn btn-danger" style="width:auto; padding:6px 12px; font-size:0.78rem;" onclick="deleteTask(${t.id})">删除</button>
        </div>
      </div>
    `).join('')}
  `;
}

async function deleteTask(id) {
  if (!confirm('确定删除这个任务？相关评论和接单记录也会删除。')) return;
  const res = await API.del(`/api/admin/tasks/${id}`);
  if (res.error) { toast(res.error); return; }
  toast('✅ 已删除任务');
  loadAdminTasks();
}

async function loadAdminFeedback() {
  const res = await API.get('/api/feedback');
  const el = document.getElementById('admin-content');
  if (!el) return;
  if (!res.feedbacks || res.feedbacks.length === 0) {
    el.innerHTML = `<div class="empty"><div class="emoji">📭</div><p>暂无反馈</p></div>`;
    return;
  }
  el.innerHTML = `
    <h3 style="font-size:1rem; margin-bottom:12px;">📥 反馈列表 (${res.feedbacks.length})</h3>
    ${res.feedbacks.map(f => `
      <div class="task-card" style="padding:12px;">
        <div style="display:flex; align-items:flex-start; gap:10px;">
          <div style="flex:1;">
            <div style="font-size:0.82rem; color:var(--text-light); margin-bottom:4px;">
              <strong>${escapeHTML(f.username)}</strong> · ${formatTime(f.created_at)}
              ${f.contact ? ` · 📞 ${escapeHTML(f.contact)}` : ''}
            </div>
            <div style="font-size:0.88rem; line-height:1.5;">${escapeHTML(f.content).replace(/\n/g, '<br>')}</div>
          </div>
          <button class="btn btn-danger" style="width:auto; padding:6px 12px; font-size:0.78rem;" onclick="deleteFeedback(${f.id})">删除</button>
        </div>
      </div>
    `).join('')}
  `;
}

async function deleteFeedback(id) {
  if (!confirm('确定删除这条反馈？')) return;
  const res = await API.del(`/api/admin/feedback/${id}`);
  if (res.error) { toast(res.error); return; }
  toast('✅ 已删除');
  loadAdminFeedback();
}

// ===== 登录统计与日志 =====
async function loadAdminLoginStats() {
  const res = await API.get('/api/admin/login-stats');
  const el = document.getElementById('admin-content');
  if (!el) return;
  if (res.error) { el.innerHTML = `<p style="color:var(--danger);">${res.error}</p>`; return; }

  el.innerHTML = `
    <div style="display:flex; gap:12px; margin-bottom:16px;">
      <div style="flex:1; background:var(--card-bg); border-radius:var(--radius); padding:16px; text-align:center; box-shadow:var(--shadow);">
        <div style="font-size:1.8rem; font-weight:800; color:var(--primary);">${res.total_count || 0}</div>
        <div style="font-size:0.78rem; color:var(--text-light);">总登录次数</div>
      </div>
      <div style="flex:1; background:var(--card-bg); border-radius:var(--radius); padding:16px; text-align:center; box-shadow:var(--shadow);">
        <div style="font-size:1.8rem; font-weight:800; color:var(--accent);">${res.today_count || 0}</div>
        <div style="font-size:0.78rem; color:var(--text-light);">今日登录</div>
      </div>
    </div>
    <h3 style="font-size:1rem; margin-bottom:12px;">📊 用户登录排行</h3>
    ${res.users.map(u => `
      <div class="task-card" style="padding:12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.5rem;">${u.avatar}</span>
          <div style="flex:1;">
            <div style="font-weight:600;">${escapeHTML(u.username)} ${u.is_admin ? '<span class="tag tag-reward" style="font-size:0.7rem;">管理员</span>' : ''}</div>
            <div style="font-size:0.78rem; color:var(--text-light);">
              登录 ${u.login_count || 0} 次 · 上次: ${u.last_login_at ? formatTime(u.last_login_at) : '从未登录'}
            </div>
          </div>
          <span style="font-weight:700; color:var(--primary);">${u.login_count || 0}</span>
        </div>
      </div>
    `).join('')}
  `;
}

async function loadAdminLoginLogs() {
  const res = await API.get('/api/admin/login-logs');
  const el = document.getElementById('admin-content');
  if (!el) return;
  if (res.error) { el.innerHTML = `<p style="color:var(--danger);">${res.error}</p>`; return; }
  if (!res.logs || res.logs.length === 0) {
    el.innerHTML = `<div class="empty"><div class="emoji">📭</div><p>暂无登录记录</p></div>`;
    return;
  }

  el.innerHTML = `
    <h3 style="font-size:1rem; margin-bottom:12px;">📝 登录日志（最近 200 条）</h3>
    ${res.logs.map(l => `
      <div class="task-card" style="padding:10px 12px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <span style="font-size:1.3rem;">${l.avatar || '👤'}</span>
          <div style="flex:1;">
            <div style="font-weight:600; font-size:0.88rem;">${escapeHTML(l.username)}</div>
            <div style="font-size:0.74rem; color:var(--text-light); margin-top:2px;">
              🌐 ${escapeHTML(l.ip || '未知')} · ${formatTime(l.login_time)}
            </div>
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

// Init
init();
