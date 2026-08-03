import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/charge', requireAuth, paymentController.charge);
router.get('/history', requireAuth, paymentController.history);

export default router;
