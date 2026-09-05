const express = require('express');
const db = require('../db');
const { formatYuan, genOutTradeNo, formatTime, statusText } = require('../util');

const router = express.Router();

// 首页：商品列表
router.get('/', (req, res) => {
  const settings = db.getSettings();
  const products = db.listProducts(true);
  res.render('shop/index', {
    title: settings.storeName,
    store: settings,
    products,
    formatYuan,
  });
});

// 商品详情
router.get('/product/:id', (req, res) => {
  const product = db.getProduct(req.params.id);
  if (!product || product.status !== 'on') return res.status(404).render('shop/error', { message: '商品不存在' });
  const settings = db.getSettings();
  res.render('shop/product', {
    title: product.name,
    store: settings,
    product,
    formatYuan,
  });
});

// 下单：买家填姓名+联系方式+数量
router.post('/order', (req, res) => {
  const { productId, buyerName, buyerContact, quantity } = req.body;
  const product = db.getProduct(productId);
  if (!product || product.status !== 'on') {
    return res.status(400).render('shop/error', { message: '商品不可用' });
  }
  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  if (!buyerName || !buyerContact) {
    return res.status(400).render('shop/error', { message: '请填写姓名和联系方式' });
  }
  if (product.stock != null && product.stock < qty) {
    return res.status(400).render('shop/error', { message: '库存不足' });
  }
  const amount = product.price * qty;
  const order = db.addOrder({
    outTradeNo: genOutTradeNo(),
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity: qty,
    amount,
    buyerName: String(buyerName).slice(0, 50),
    buyerContact: String(buyerContact).slice(0, 100),
    payMode: db.getSettings().payMode, // 记录下单时的收款模式
  });
  // 扣库存
  if (product.stock != null) {
    db.updateProduct(product.id, { stock: product.stock - qty });
  }
  res.redirect(`/pay/${order.outTradeNo}`);
});

module.exports = router;
