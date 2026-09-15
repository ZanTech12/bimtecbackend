const express = require('express');
const router = express.Router();
const { authenticateToken, isSuperAdmin } = require('../middlewares/authMiddleware');
const superAdminController = require('../controllers/superAdminController');

// All routes below require a valid token AND the superadmin role
router.use(authenticateToken, isSuperAdmin);

router.route('/admins')
    .get(superAdminController.getAllAdmins)
    .post(superAdminController.createAdmin);

router.route('/admins/:id')
    .put(superAdminController.updateAdmin)
    .delete(superAdminController.deleteAdmin);

router.route('/admins/:id/toggle-status')
    .patch(superAdminController.toggleAdminStatus);

module.exports = router;