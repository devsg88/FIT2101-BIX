import { Router } from 'express';
import { loginController } from '../controllers/authController.js';
import { forgotPasswordController } from '../controllers/passwordResetController.js';

const router = Router();

router.post('/login', loginController);
router.post('/forgot-password', forgotPasswordController);

export default router;
