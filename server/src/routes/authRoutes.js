import { Router } from 'express';
import { loginController } from '../controllers/authController.js';
import {
  forgotPasswordController,
  getDemoMailboxController,
  resetPasswordController
} from '../controllers/passwordResetController.js';
import { loginRateLimiter } from '../middleware/rateLimitMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.post('/login', loginRateLimiter, asyncHandler(loginController));
router.post('/forgot-password', asyncHandler(forgotPasswordController));
router.post('/reset-password', asyncHandler(resetPasswordController));
router.get('/demo-mailbox', getDemoMailboxController);

export default router;
