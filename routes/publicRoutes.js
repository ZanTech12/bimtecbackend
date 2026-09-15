const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/publicController');

// No authenticateToken middleware here
router.get('/terms', ctrl.getPublicTerms);
router.get('/sessions', ctrl.getPublicSessions);

module.exports = router;