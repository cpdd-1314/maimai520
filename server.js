const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('./src/config');
const db = require('./src/db');

const app = express();

// 视图
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 静态资源
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(config.UPLOAD_DIR));

// 表单解析
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 会话
app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7, httpOnly: true, sameSite: 'lax' },
  })
);

// 初始化数据库（种子管理员）
db.init();

// 路由
app.use('/', require('./src/routes/shop'));
app.use('/', require('./src/routes/pay'));
app.use('/', require('./src/routes/admin'));

// 兜底 404
app.use((req, res) => {
  res.status(404).send('页面不存在');
});

app.listen(config.PORT, () => {
  console.log(`微信小商店已启动: http://localhost:${config.PORT}`);
  if (!config.isWechatConfigured()) {
    console.log('[提示] 微信支付未配置，支付页将提示未配置。请在后台/环境变量填写 WX_* 参数。');
  }
});
