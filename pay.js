const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const wp = require('../wechatpay');
const upload = require('../upload');
const { formatYuan, statusText } = require('../util');

const router = express.Router();

// 支付页：按「下单时的收款模式」分支渲染
router.get('/pay/:outTradeNo', async (req, res) => {
  const order = db.getOrderByOutTradeNo(req.params.outTradeNo);
  if (!order) return res.status(404).render('shop/error', { message: '订单不存在' });
  const settings = db.getSettings();

  // 已完成/已付款 -> 成功页
  if (order.status === 'paid' || order.status === 'completed') {
    return res.render('shop/pay-result', { order, formatYuan, statusText, settings, paid: true });
  }

  const payMode = order.payMode || settings.payMode;

  // ===== 模式一：个人收款码（静态码 + 买家传支付截图 + 商家确认）=====
  if (payMode === 'personal') {
    return res.render('shop/pay-personal', {
      order,
      formatYuan,
      settings,
      qrImage: settings.qrImage || '',
      submitted: order.status === 'submitted',
      message: settings.qrImage ? '' : '商家尚未上传收款码，请联系商家。',
      error: '',
    });
  }

  // ===== 模式二：微信支付官方 API（Native 扫码 + 回调自动确认）=====
  if (!wp.isConfigured) {
    return res.render('shop/pay', {
      order, formatYuan, settings, configured: false, qr: '',
      message: '支付通道未配置（请在环境变量中填写 WX_* 参数，或在后台切换为「个人收款码」模式）。',
    });
  }

  try {
    let codeUrl = order.codeUrl;
    if (!codeUrl) {
      const r = await wp.createNativeOrder({
        description: order.productName,
        outTradeNo: order.outTradeNo,
        amountYuan: order.amount / 100,
      });
      codeUrl = r.codeUrl;
      db.updateOrder(order.id, { codeUrl });
    }
    const qr = await QRCode.toDataURL(codeUrl);
    res.render('shop/pay', { order, formatYuan, settings, configured: true, qr, message: '' });
  } catch (e) {
    console.error('[pay] 生成支付二维码失败:', e.message);
    res.render('shop/pay', {
      order, formatYuan, settings, configured: true, qr: '',
      message: '生成支付二维码失败：' + e.message,
    });
  }
});

// 个人收款码模式：买家上传支付截图
router.post('/pay/:outTradeNo/proof', async (req, res) => {
  const order = db.getOrderByOutTradeNo(req.params.outTradeNo);
  if (!order) return res.status(404).render('shop/error', { message: '订单不存在' });
  const settings = db.getSettings();

  const { error, file } = await upload.uploadSingle(req, res, 'proof');
  if (error) {
    return res.render('shop/pay-personal', {
      order, formatYuan, settings,
      qrImage: settings.qrImage || '',
      submitted: order.status === 'submitted',
      message: '',
      error,
    });
  }
  if (!file) {
    return res.render('shop/pay-personal', {
      order, formatYuan, settings,
      qrImage: settings.qrImage || '',
      submitted: order.status === 'submitted',
      message: '',
      error: '请先选择支付截图再提交。',
    });
  }

  db.updateOrder(order.id, {
    proofImage: '/uploads/' + file.filename,
    status: 'submitted', // 待商家确认收款
  });
  res.redirect('/pay/' + order.outTradeNo);
});

// 订单状态轮询（前端每 3 秒调用）
router.get('/api/order/:outTradeNo/status', (req, res) => {
  const order = db.getOrderByOutTradeNo(req.params.outTradeNo);
  if (!order) return res.status(404).json({ error: '订单不存在' });
  res.json({
    status: order.status,
    paid: order.status === 'paid' || order.status === 'completed',
    pendingConfirm: order.status === 'submitted',
  });
});

// 微信支付回调通知（官方 API 模式）
router.post(
  '/pay/notify',
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString('utf8');
    },
  }),
  async (req, res) => {
    const h = req.headers;
    const timestamp = h['wechatpay-timestamp'];
    const nonce = h['wechatpay-nonce'];
    const signature = h['wechatpay-signature'];
    const serial = h['wechatpay-serial'];
    const body = req.rawBody || JSON.stringify(req.body);

    try {
      const ok = await wp.verifyCallback({ timestamp, nonce, body, signature, serial });
      if (!ok) {
        console.error('[wechat] 回调验签失败');
        return res.status(401).json({ code: 'FAIL', message: '签名错误' });
      }

      const decrypted = wp.decryptResource(req.body.resource);
      const order = db.getOrderByOutTradeNo(decrypted.out_trade_no);

      if (!order) {
        console.error('[wechat] 回调订单不存在:', decrypted.out_trade_no);
        return res.json({ code: 'SUCCESS', message: '成功' }); // 未知订单直接确认，避免微信反复重试
      }

      // 金额一致性校验：防止伪造通知造成「假支付」
      const paid = decrypted.amount && parseInt(decrypted.amount.total, 10);
      if (paid !== order.amount) {
        console.error(`[wechat] 金额不符 订单${order.outTradeNo} 通知${paid} 实际${order.amount}`);
        return res.status(400).json({ code: 'FAIL', message: '金额不符' });
      }

      if (decrypted.trade_state === 'SUCCESS' && order.status === 'pending') {
        db.updateOrder(order.id, {
          status: 'paid',
          transactionId: decrypted.transaction_id || '',
          paidAt: Date.now(),
        });
        console.log(`[wechat] 订单 ${order.outTradeNo} 已支付`);
      }

      return res.json({ code: 'SUCCESS', message: '成功' });
    } catch (e) {
      console.error('[wechat] 回调处理异常:', e.message);
      return res.status(500).json({ code: 'FAIL', message: '处理失败' });
    }
  }
);

module.exports = router;
