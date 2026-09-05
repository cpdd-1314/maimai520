const express = require('express');
const db = require('../db');
const upload = require('../upload');
const { authenticate, requireAuth, hashPassword, verifyPassword } = require('../auth');
const { formatYuan, formatTime, statusText } = require('../util');
const wp = require('../wechatpay');

const router = express.Router();

// ============ 登录 ============
router.get('/admin/login', (req, res) => {
  if (req.session && req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: '管理员登录', error: '' });
});

router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const r = authenticate(username || '', password || '');
  if (!r.ok) {
    return res.render('admin/login', {
      title: '管理员登录',
      error: r.reason === 'bad-credentials' ? '账号或密码错误' : '登录失败',
    });
  }
  req.session.adminId = r.admin.id;
  if (r.admin.mustChange) return res.redirect('/admin/settings?must=1');
  res.redirect('/admin');
});

router.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// ============ 以下需登录 ============
router.use(requireAuth);

// 仪表盘
router.get('/admin', (req, res) => {
  const orders = db.listOrders();
  const products = db.listProducts();
  const stats = {
    total: orders.length,
    paid: orders.filter((o) => o.status === 'paid' || o.status === 'completed').length,
    pending: orders.filter((o) => o.status === 'pending').length,
    submitted: orders.filter((o) => o.status === 'submitted').length,
    revenue: orders
      .filter((o) => o.status === 'paid' || o.status === 'completed')
      .reduce((s, o) => s + o.amount, 0),
  };
  const store = db.getSettings();
  res.render('admin/dashboard', {
    title: '仪表盘',
    store,
    // 个人收款码模式下没传收款码，买家将无法付款
    missingQr: store.payMode === 'personal' && !store.qrImage,
    stats,
    recentOrders: orders.slice(0, 10),
    productCount: products.length,
    formatYuan,
    formatTime,
    statusText,
  });
});

// ============ 商品管理 ============
router.get('/admin/products', (req, res) => {
  res.render('admin/products', {
    title: '商品管理',
    products: db.listProducts(),
    formatYuan,
    error: '',
  });
});

router.get('/admin/products/:id/edit', (req, res) => {
  const p = db.getProduct(req.params.id);
  if (!p) return res.redirect('/admin/products');
  res.render('admin/product-edit', { title: '编辑商品', product: p, formatYuan });
});

router.post('/admin/products', async (req, res) => {
  // 注意：必须先等 multer 解析完 multipart，req.body 才有值
  const { error, file } = await upload.uploadSingle(req, res, 'image');
  if (error) {
    return res.render('admin/products', {
      title: '商品管理', products: db.listProducts(), formatYuan, error,
    });
  }
  const { name, description, price, stock, sort, status } = req.body;
  if (!name || price === undefined || price === '') {
    return res.render('admin/products', {
      title: '商品管理', products: db.listProducts(), formatYuan, error: '请填写商品名称和价格',
    });
  }
  db.addProduct({
    name: String(name).slice(0, 100),
    description: String(description || '').slice(0, 2000),
    price: Math.round(parseFloat(price) * 100),
    image: file ? '/uploads/' + file.filename : '',
    stock: stock === undefined ? null : stock,
    sort: sort || 0,
    status: status === 'off' ? 'off' : 'on',
  });
  res.redirect('/admin/products');
});

router.post('/admin/products/:id/edit', async (req, res) => {
  const p = db.getProduct(req.params.id);
  if (!p) return res.redirect('/admin/products');
  const { error, file } = await upload.uploadSingle(req, res, 'image');
  if (error) {
    return res.render('admin/product-edit', { title: '编辑商品', product: p, formatYuan, error });
  }
  const { name, description, price, stock, sort, status, removeImage } = req.body;
  const patch = {
    name: String(name).slice(0, 100),
    description: String(description || '').slice(0, 2000),
    price: Math.round(parseFloat(price) * 100),
    stock: stock === '' || stock == null ? null : parseInt(stock, 10),
    sort: sort ? parseInt(sort, 10) : 0,
    status: status === 'off' ? 'off' : 'on',
  };
  if (file) patch.image = '/uploads/' + file.filename;
  if (removeImage === '1') patch.image = '';
  db.updateProduct(p.id, patch);
  res.redirect('/admin/products');
});

router.post('/admin/products/:id/delete', (req, res) => {
  db.deleteProduct(req.params.id);
  res.redirect('/admin/products');
});

// ============ 订单管理 ============
router.get('/admin/orders', (req, res) => {
  res.render('admin/orders', {
    title: '订单管理',
    orders: db.listOrders(),
    formatYuan,
    formatTime,
    statusText,
  });
});

router.post('/admin/orders/:id/status', (req, res) => {
  const allowed = ['pending', 'submitted', 'paid', 'completed', 'cancelled'];
  const { status } = req.body;
  if (allowed.includes(status)) {
    const patch = { status };
    if (status === 'paid') patch.paidAt = Date.now();
    db.updateOrder(req.params.id, patch);
  }
  res.redirect('/admin/orders');
});

// 个人收款码模式：商家核对截图后确认收款
router.post('/admin/orders/:id/confirm', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (order && (order.status === 'submitted' || order.status === 'pending')) {
    db.updateOrder(order.id, { status: 'paid', paidAt: Date.now() });
  }
  res.redirect('/admin/orders');
});

// ============ 设置 ============
router.get('/admin/settings', (req, res) => {
  res.render('admin/settings', {
    title: '设置',
    store: db.getSettings(),
    must: req.query.must === '1',
    wechatConfigured: wp.isConfigured,
    error: '',
    success: '',
  });
});

router.post('/admin/settings', async (req, res) => {
  const store = db.getSettings();
  const { error, file } = await upload.uploadSingle(req, res, 'qrImage');

  const fail = (msg) =>
    res.render('admin/settings', {
      title: '设置', store, must: false, wechatConfigured: wp.isConfigured,
      error: msg, success: '',
    });

  if (error) return fail(error);

  // multer 解析完成后再读取表单字段
  const { oldPassword, newPassword, confirmPassword, storeName, storeNotice, payMode, removeQrImage } = req.body;

  // 改密码：需校验原密码
  if (newPassword) {
    const admin = db.getAdmin();
    if (!verifyPassword(oldPassword || '', admin.passwordHash)) return fail('原密码错误');
    if (newPassword.length < 6) return fail('新密码至少 6 位');
    if (newPassword !== confirmPassword) return fail('两次输入的新密码不一致');
    db.updateAdmin({ passwordHash: hashPassword(newPassword), mustChange: false });
  }

  // 收款码图片
  let qrImage = store.qrImage;
  if (file) qrImage = '/uploads/' + file.filename;
  if (removeQrImage === '1') qrImage = '';

  db.updateSettings({
    storeName: (storeName || '').slice(0, 50) || store.storeName,
    storeNotice: (storeNotice || '').slice(0, 500),
    payMode: payMode === 'official' ? 'official' : 'personal',
    qrImage,
  });

  res.render('admin/settings', {
    title: '设置', store: db.getSettings(), must: false, wechatConfigured: wp.isConfigured,
    error: '', success: '保存成功',
  });
});

module.exports = router;
