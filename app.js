const express = require('express');
const cookieSession = require('cookie-session');
const path = require('path');
const { initDB } = require('./db/init');
const routes = require('./routes');

// 修复 BigInt JSON 序列化（Turso 返回的 lastInsertRowid 是 BigInt）
BigInt.prototype.toJSON = function() { return Number(this); };

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session 配置 - 使用 cookie-session，数据存在浏览器加密 cookie 中
// 这样 Vercel Serverless 不同容器之间也能共享登录状态
app.use(cookieSession({
  name: 'taskhub_session',
  keys: [process.env.SESSION_SECRET || 'taskhub-secret-key-2026-very-long-and-random'],
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
  httpOnly: true,
  secure: false, // 允许 http 和 https
  sameSite: 'lax'
}));

// API 路由
app.use(routes);

// 页面路由（SPA 风格，统一返回 index.html）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// 本地开发时直接监听，Vercel 部署时导出 app
if (require.main === module) {
  initDB().then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 TaskHub 运行中: http://localhost:${PORT}`);
    });
  });
}

module.exports = app;
