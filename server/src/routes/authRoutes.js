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

// The demo mailbox is unauthenticated by necessity (see passwordResetController.js)
// and returns every recent reset link, not just the caller's own - fine for
// local testing, a real exposure once this is reachable publicly. Real
// email delivery (emailSender.js) now covers the same job the mailbox was
// standing in for, so it's off by default and only registered when
// explicitly opted into - off, this is a plain 404, not even a 403, no
// trace it ever existed.
if (process.env.DEMO_MAILBOX_ENABLED === 'true') {
  router.get('/demo-mailbox', getDemoMailboxController);
}

export default router;
