const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const { initDB } = require('./db/init');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session 配置 - 使用加密 cookie
const SESSION_SECRET = process.env.SESSION_SECRET || 'taskhub-secret-key-2026-very-long';

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
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
