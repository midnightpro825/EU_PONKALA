// =============================================
// EU PONKALA — Multer upload config
// =============================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const BASE = path.join(__dirname, 'uploads');

// Ensure subfolders exist
['properties', 'rooms', 'avatars'].forEach(sub => {
    const p = path.join(BASE, sub);
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let sub = 'properties';
        if (req.baseUrl.includes('/rooms')) sub = 'rooms';
        if (req.path.includes('avatar')) sub = 'avatars';
        cb(null, path.join(BASE, sub));
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'].includes(file.mimetype);
    cb(ok ? null : new Error('Only JPEG, PNG, and WebP images are allowed'), ok);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 8 * 1024 * 1024 } // 8MB per file
});

module.exports = { upload, BASE };