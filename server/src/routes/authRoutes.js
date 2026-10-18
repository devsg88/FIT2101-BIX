import { Router } from 'express';
import { loginController } from '../controllers/authController.js';
import {
  forgotPasswordController,
  getDemoMailboxController,
  resetPasswordController
} from '../controllers/passwordResetController.js';
import { loginRateLimiter } from '../middleware/rateLimitMiddleware.js';

const router = Router();

router.post('/login', loginRateLimiter, loginController);
router.post('/forgot-password', forgotPasswordController);
router.post('/reset-password', resetPasswordController);
router.get('/demo-mailbox', getDemoMailboxController);

export default router;
