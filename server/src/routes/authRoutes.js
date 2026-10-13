import { Router } from 'express';
import { loginController } from '../controllers/authController.js';
import {
  forgotPasswordController,
  resetPasswordController
} from '../controllers/passwordResetController.js';

const router = Router();

router.post('/login', loginController);
router.post('/forgot-password', forgotPasswordController);
router.post('/reset-password', resetPasswordController);

export default router;
