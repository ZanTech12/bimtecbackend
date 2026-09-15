const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authenticateToken = require('../middlewares/authMiddleware').authenticateToken;

// Ensure the upload folder exists on first use
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'questions');
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, 'q-' + unique + path.extname(file.originalname).toLowerCase());
    },
});

// Images only, max 5MB
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const ok = /^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(file.mimetype);
        cb(ok ? null : new Error('Only image files are allowed'), ok);
    },
});

// POST /question-sets/upload-image   (multipart field: "image")
router.post('/upload-image', authenticateToken, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded' });

    res.json({
        success: true,
        url: `/uploads/questions/${req.file.filename}`, // relative → sanitizer-safe
    });
});

module.exports = router;