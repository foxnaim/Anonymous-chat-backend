import { Router } from 'express';
import {
  login,
  register,
  verifyPassword,
  getMe,
  forgotPassword,
  resetPassword,
} from '../controllers/AuthController';
import { validate } from '../middleware/validation';
import {
  loginSchema,
  registerSchema,
  verifyPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/authValidator';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', validate(loginSchema), login);
router.post('/register', validate(registerSchema), register);
router.post('/verify-password', validate(verifyPasswordSchema), verifyPassword);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);
router.get(
  '/me',
  (req, res, next) => {
    authenticate(req, res, next);
  },
  getMe
);

export default router;
