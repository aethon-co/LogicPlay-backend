const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.post('/send-otp', authController.sendOtp);
router.post('/verify-otp', authController.verifyOtp);
router.post('/signup', authController.signup);
router.post('/login', authController.login);
router.get('/me', requireAuth, authController.me);

module.exports = router;
