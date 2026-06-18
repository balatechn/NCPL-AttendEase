const router = require('express').Router();
const authController = require('../controllers/authController');
const { authenticate, authorize } = require('../middleware/auth');

router.post('/login', authController.login);
router.post('/refresh', authController.refreshToken);
router.get('/me', authenticate, authController.me);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-otp', authController.verifyOtp);
router.post('/reset-password', authController.resetPassword);
router.post('/send-welcome-emails', authenticate, authorize('admin'), authController.sendWelcomeEmails);
router.get('/microsoft', authController.microsoftRedirect);
router.get('/microsoft/callback', authController.microsoftCallback);

module.exports = router;
