const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 10);
    const name = crypto.randomBytes(12).toString('hex') + ext;
    cb(null, name);
  },
});

function fileFilter(req, file, cb) {
  const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (!allowed.includes(ext)) {
    return cb(new Error('仅支持图片格式：jpg/jpeg/png/gif/webp'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
});

// Promise 封装，便于在路由内捕获上传错误（类型不符/超过大小限制）并友好提示
function uploadSingle(req, res, field) {
  return new Promise((resolve) => {
    upload.single(field)(req, res, (err) => {
      if (err) return resolve({ error: err.message, file: null });
      resolve({ error: null, file: req.file || null });
    });
  });
}

module.exports = upload;
module.exports.uploadSingle = uploadSingle;
