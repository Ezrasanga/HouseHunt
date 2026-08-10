import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.post('/', requireAuth, paymentController.createPayment);
router.get('/booking/:bookingId', requireAuth, paymentController.listPaymentsByBooking);
router.post('/:paymentId/stk-push', requireAuth, paymentController.initiateStkPush);
router.get('/:id', requireAuth, paymentController.getPayment);
router.get('/', requireAuth, paymentController.listPayments);

// Public MPESA callback endpoint - not authenticated
router.post('/mpesa/callback', paymentController.mpesaCallback);

export default router;
