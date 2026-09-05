const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

fs.mkdirSync(config.DATA_DIR, { recursive: true });
fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });

const DB_FILE = path.join(config.DATA_DIR, 'db.json');

function emptyState() {
  return {
    seq: { product: 0, order: 0, admin: 0 },
    products: [],
    orders: [],
    admin: [],
    settings: {
      storeName: config.STORE_NAME,
      storeNotice: config.STORE_NOTICE,
      // 收款模式：personal=个人收款码（无需商户资质）；official=微信支付官方 API（需商户号）
      payMode: config.PAY_MODE,
      qrImage: '', // 个人收款码图片路径（存于 uploads）
    },
  };
}

function load() {
  if (!fs.existsSync(DB_FILE)) return emptyState();
  try {
    const s = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    // 兼容字段
    s.seq = s.seq || { product: 0, order: 0, admin: 0 };
    s.products = s.products || [];
    s.orders = s.orders || [];
    s.admin = s.admin || [];
    s.settings.storeNotice = s.settings.storeNotice === undefined ? config.STORE_NOTICE : s.settings.storeNotice;
    if (!s.settings.payMode) s.settings.payMode = config.PAY_MODE;
    if (s.settings.qrImage === undefined) s.settings.qrImage = '';
    return s;
  } catch (e) {
    console.error('读取数据库失败，使用空库:', e.message);
    return emptyState();
  }
}

let state = load();

function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function nextId(key) {
  state.seq[key] = (state.seq[key] || 0) + 1;
  return state.seq[key];
}

// ============ 初始化种子 ============
function init() {
  if (state.admin.length === 0) {
    const { hashPassword } = require('./auth');
    state.admin.push({
      id: nextId('admin'),
      username: config.ADMIN_USERNAME,
      passwordHash: hashPassword(config.ADMIN_PASSWORD),
      mustChange: true, // 首次登录强制改密
      createdAt: Date.now(),
    });
    persist();
    console.log(`[db] 已创建管理员账号: ${config.ADMIN_USERNAME}`);
  }
  if (!state.settings.storeName) state.settings.storeName = config.STORE_NAME;
  if (state.settings.storeNotice === undefined) state.settings.storeNotice = config.STORE_NOTICE;
  if (!state.settings.payMode) state.settings.payMode = config.PAY_MODE;
  if (state.settings.qrImage === undefined) state.settings.qrImage = '';
}

// ============ 商品 ============
function listProducts(onlyOn = false) {
  let p = state.products.slice().sort((a, b) => (b.sort || 0) - (a.sort || 0) || b.id - a.id);
  if (onlyOn) p = p.filter((x) => x.status === 'on');
  return p;
}
function getProduct(id) {
  return state.products.find((p) => p.id === parseInt(id, 10)) || null;
}
function addProduct(data) {
  const p = {
    id: nextId('product'),
    name: data.name,
    description: data.description || '',
    price: parseInt(data.price, 10), // 单位：分
    image: data.image || '',
    stock: data.stock === '' || data.stock == null ? null : parseInt(data.stock, 10),
    sort: data.sort ? parseInt(data.sort, 10) : 0,
    status: data.status === 'off' ? 'off' : 'on',
    createdAt: Date.now(),
  };
  state.products.push(p);
  persist();
  return p;
}
function updateProduct(id, patch) {
  const p = getProduct(id);
  if (!p) return null;
  Object.assign(p, patch);
  persist();
  return p;
}
function deleteProduct(id) {
  const p = getProduct(id);
  if (!p) return false;
  state.products = state.products.filter((x) => x.id !== parseInt(id, 10));
  persist();
  return true;
}

// ============ 订单 ============
function listOrders() {
  return state.orders.slice().sort((a, b) => b.createdAt - a.createdAt);
}
function getOrder(id) {
  return state.orders.find((o) => o.id === parseInt(id, 10)) || null;
}
function getOrderByOutTradeNo(no) {
  return state.orders.find((o) => o.outTradeNo === no) || null;
}
function addOrder(data) {
  const o = {
    id: nextId('order'),
    outTradeNo: data.outTradeNo,
    productId: data.productId,
    productName: data.productName,
    unitPrice: data.unitPrice, // 分
    quantity: data.quantity,
    amount: data.amount, // 分
    buyerName: data.buyerName,
    buyerContact: data.buyerContact,
    status: 'pending', // pending 待支付 / submitted 待确认收款 / paid 已付款 / completed 已完成 / cancelled 已取消
    codeUrl: data.codeUrl || '',
    payMode: data.payMode || config.PAY_MODE, // 下单时的收款模式快照
    proofImage: '', // 个人收款码模式下买家上传的支付截图
    transactionId: '',
    createdAt: Date.now(),
    paidAt: null,
  };
  state.orders.push(o);
  persist();
  return o;
}
function updateOrder(id, patch) {
  const o = getOrder(id);
  if (!o) return null;
  Object.assign(o, patch);
  persist();
  return o;
}

// ============ 管理员 ============
function getAdmin() {
  return state.admin[0] || null;
}
function updateAdmin(patch) {
  const a = getAdmin();
  if (!a) return null;
  Object.assign(a, patch);
  persist();
  return a;
}

// ============ 设置 ============
function getSettings() {
  return state.settings;
}
function updateSettings(patch) {
  Object.assign(state.settings, patch);
  persist();
  return state.settings;
}

module.exports = {
  init,
  listProducts,
  getProduct,
  addProduct,
  updateProduct,
  deleteProduct,
  listOrders,
  getOrder,
  getOrderByOutTradeNo,
  addOrder,
  updateOrder,
  getAdmin,
  updateAdmin,
  getSettings,
  updateSettings,
};
