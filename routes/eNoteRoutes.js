const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const eNoteController = require('../controllers/eNoteController');

// Use your exact auth middleware
const authenticateToken = require('../middlewares/authMiddleware').authenticateToken;

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'uploads', 'enotes');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Configuration for PDF uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `enote-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => file.mimetype === 'application/pdf' ? cb(null, true) : cb(new Error('Only PDFs allowed!'), false),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ============================================
// ROUTES
// ============================================

router.get('/my-info', authenticateToken, eNoteController.getMyStudentInfo);
router.get('/my-classes', authenticateToken, eNoteController.getMyClasses);
router.get('/my-subjects', authenticateToken, eNoteController.getMySubjects);
router.get('/students', authenticateToken, eNoteController.getStudentsByClass);
router.get('/weeks', authenticateToken, eNoteController.getWeeksByClass);

router.post('/weeks', authenticateToken, eNoteController.createWeek);
router.post('/weeks/:weekId/upload', authenticateToken, upload.array('pdfFiles', 10), eNoteController.uploadFiles);

router.delete('/files/:fileId', authenticateToken, eNoteController.deleteFile);
// ✅ Delete Week (Admin Only)
router.delete('/weeks/:weekId', authenticateToken, eNoteController.deleteWeek);

module.exports = router;