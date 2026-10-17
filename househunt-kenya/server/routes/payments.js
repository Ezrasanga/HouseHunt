import express from 'express';
import * as paymentController from '../controllers/paymentController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();
router.get('/fees', paymentController.getPropertyPaymentFees);
router.get('/unlocks', requireAuth, paymentController.listUnlockedPropertyIds);
router.post('/property', requireAuth, paymentController.createPropertyPayment);
router.get('/property/:propertyId', requireAuth, paymentController.getPropertyPayment);
router.get('/property-payments/:paymentId', requireAuth, paymentController.getPropertyPaymentById);
router.post('/property-payments/:paymentId/stk-push', requireAuth, paymentController.initiateStkPush);
router.post('/property-payments/:paymentId/stk-query', requireAuth, paymentController.queryStkPushStatus);

// Public MPESA callback endpoint - not authenticated
router.post('/mpesa/callback', paymentController.mpesaCallback);

export default router;
