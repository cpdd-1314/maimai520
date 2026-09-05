const crypto = require('crypto');
const config = require('./config');

const API_BASE = 'https://api.mch.weixin.qq.com';

// ============ 商户私钥 ============
function getPrivateKey() {
  let key = config.wechat.privateKey;
  if (config.wechat.privateKeyFile) {
    try {
      key = require('fs').readFileSync(config.wechat.privateKeyFile, 'utf8');
    } catch (e) {
      console.error('[wechat] 读取私钥文件失败:', e.message);
    }
  }
  if (!key) return '';
  key = key.replace(/\\n/g, '\n');
  if (!key.includes('BEGIN')) {
    key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----\n`;
  }
  return key;
}

// ============ 签名 ============
function sign(method, urlPath, bodyStr, timestamp, nonceStr) {
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${bodyStr}\n`;
  const sig = crypto.createSign('RSA-SHA256').update(message).sign(getPrivateKey(), 'base64');
  return sig;
}

function buildAuthorization(method, urlPath, bodyStr) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const signature = sign(method, urlPath, bodyStr, timestamp, nonceStr);
  return (
    `WECHATPAY2-SHA256-RSA2048 ` +
    `mchid="${config.wechat.mchid}",` +
    `nonce_str="${nonceStr}",` +
    `signature="${signature}",` +
    `timestamp="${timestamp}",` +
    `serial_no="${config.wechat.serialNo}"`
  );
}

// ============ 通用请求 ============
async function request(method, urlPath, bodyObj) {
  const bodyStr = bodyObj ? JSON.stringify(bodyObj) : '';
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: buildAuthorization(method, urlPath, bodyStr),
    'User-Agent': 'wxshop/1.0',
  };
  const res = await fetch(API_BASE + urlPath, {
    method,
    headers,
    body: method === 'GET' ? undefined : bodyStr,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error('微信支付请求失败: ' + (data && (data.message || data.raw)));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ============ Native 下单 ============
// amountUnit: 元（自动转分）；返回 { codeUrl }
async function createNativeOrder({ description, outTradeNo, amountYuan }) {
  const total = Math.round(parseFloat(amountYuan) * 100);
  if (!total || total <= 0) throw new Error('金额无效');
  const body = {
    appid: config.wechat.appid,
    mchid: config.wechat.mchid,
    description: String(description).slice(0, 127),
    out_trade_no: outTradeNo,
    notify_url: config.wechat.notifyUrl,
    amount: { total, currency: 'CNY' },
  };
  const data = await request('POST', '/v3/pay/transactions/native', body);
  return { codeUrl: data.code_url, total };
}

// ============ 平台证书（用于回调验签）============
let certCache = new Map(); // serial_no -> public cert PEM
let certCacheTime = 0;

async function refreshCertificates() {
  const data = await request('GET', '/v3/certificates');
  const key = config.wechat.apiV3Key;
  for (const item of data.data || []) {
    const enc = item.encrypt_certificate;
    const pem = decryptAesGcm(key, enc.ciphertext, enc.nonce, enc.associated_data);
    certCache.set(item.serial_no, pem);
  }
  certCacheTime = Date.now();
}

async function getPlatformCert(serialNo) {
  if (!certCache.has(serialNo) || Date.now() - certCacheTime > 12 * 3600 * 1000) {
    await refreshCertificates();
  }
  return certCache.get(serialNo);
}

// ============ AES-256-GCM 解密 ============
function decryptAesGcm(apiV3Key, ciphertextB64, nonce, associatedData) {
  const buf = Buffer.from(ciphertextB64, 'base64');
  const authTag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', apiV3Key, nonce);
  decipher.setAuthTag(authTag);
  if (associatedData) decipher.setAAD(Buffer.from(associatedData));
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

// ============ 回调验签 ============
async function verifyCallback({ timestamp, nonce, body, signature, serial }) {
  let cert;
  try {
    cert = await getPlatformCert(serial);
  } catch (e) {
    console.error('[wechat] 获取平台证书失败:', e.message);
    return false;
  }
  if (!cert) return false;
  const message = `${timestamp}\n${nonce}\n${body}\n`;
  try {
    return crypto.createVerify('RSA-SHA256').update(message).verify(cert, signature, 'base64');
  } catch (e) {
    console.error('[wechat] 回调验签异常:', e.message);
    return false;
  }
}

// 解密回调报文中的 resource，返回明文对象
function decryptResource(resource) {
  const plain = decryptAesGcm(config.wechat.apiV3Key, resource.ciphertext, resource.nonce, resource.associated_data);
  return JSON.parse(plain);
}

module.exports = {
  createNativeOrder,
  verifyCallback,
  decryptResource,
  isConfigured: config.isWechatConfigured(),
};
