require('dotenv').config();

const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
// 上传文件统一存到 DATA_DIR/uploads，对外以 /uploads 访问
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  PORT: parseInt(process.env.PORT || '3000', 10),
  SESSION_SECRET: process.env.SESSION_SECRET || 'dev-secret-change-me',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123456',
  STORE_NAME: process.env.STORE_NAME || '我的小店',
  STORE_NOTICE: process.env.STORE_NOTICE || '',
  // 默认收款模式：personal=个人收款码（无需商户资质）；official=微信支付官方API（需商户号）
  PAY_MODE: process.env.PAY_MODE === 'official' ? 'official' : 'personal',
  wechat: {
    appid: process.env.WX_APPID || '',
    mchid: process.env.WX_MCHID || '',
    apiV3Key: process.env.WX_APIV3_KEY || '',
    serialNo: process.env.WX_SERIAL_NO || '',
    privateKey: process.env.WX_PRIVATE_KEY || '',
    privateKeyFile: process.env.WX_PRIVATE_KEY_FILE || '',
    notifyUrl: process.env.WX_NOTIFY_URL || '',
  },
  // 是否已配置微信支付（用于前台判断是否展示支付入口）
  isWechatConfigured() {
    const w = this.wechat;
    return !!(w.appid && w.mchid && w.apiV3Key && w.serialNo && (w.privateKey || w.privateKeyFile) && w.notifyUrl);
  },
};
