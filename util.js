const crypto = require('crypto');

// 分 -> 元（字符串，保留两位小数）
function formatYuan(cents) {
  return (parseInt(cents, 10) / 100).toFixed(2);
}

// 生成商户订单号（外部订单号）
function genOutTradeNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = crypto.randomBytes(6).toString('hex');
  return `WX${ymd}${rand}`;
}

const ORDER_STATUS_TEXT = {
  pending: '待支付',
  submitted: '待确认收款',
  paid: '已付款',
  completed: '已完成',
  cancelled: '已取消',
};

function statusText(s) {
  return ORDER_STATUS_TEXT[s] || s;
}

function formatTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

module.exports = { formatYuan, genOutTradeNo, statusText, formatTime };
