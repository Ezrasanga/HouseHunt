import express from 'express';
import rateLimit from 'express-rate-limit';
import * as authController from '../controllers/authController.js';
import { authenticate } from '../middleware/authenticate.js';

const router = express.Router();
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: {
		success: false,
		message: 'Too many login attempts. Please try again later.',
		data: null,
		errors: [{ field: 'email', message: 'Login rate limit exceeded' }],
	},
});

router.post('/login', loginLimiter, authController.login);
router.post('/register', authController.register);
router.get('/profile', authenticate, authController.profile);

export default router;
