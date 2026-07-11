const express = require('express');
const session = require('express-session');
const path = require('path');
const { initDB } = require('./db/init');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// 初始化数据库
initDB();

// 中间件
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'taskhub-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7天
}));

// API 路由
app.use(routes);

// 页面路由（SPA 风格，统一返回 index.html）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 TaskHub 运行中: http://localhost:${PORT}`);
});
