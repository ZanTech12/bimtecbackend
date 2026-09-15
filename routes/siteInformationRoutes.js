const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const authenticateToken = require('../middlewares/authMiddleware').authenticateToken;
const ctrl = require('../controllers/siteInformationController');

// ==========================================
// MULTER CONFIGURATION (For File Uploads)
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Make sure you have a folder named "uploads" inside your "public" folder!
        cb(null, 'public/uploads/'); 
    },
    filename: function (req, file, cb) {
        // Generate a unique filename to prevent overwriting images with the same name
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// All routes are protected
router.use(authenticateToken);

// GET /site-information
router.get('/', ctrl.getSiteInfo);

// PUT /site-information (Creates or Updates)
// We use upload.fields() to accept multiple file inputs from the frontend
router.put('/', upload.fields([
    { name: 'schoolLogo', maxCount: 1 },
    { name: 'principalSignature', maxCount: 1 },
    { name: 'schoolStamp', maxCount: 1 }
]), ctrl.upsertSiteInfo);

// DELETE /site-information
router.delete('/', ctrl.deleteSiteInfo);

module.exports = router;