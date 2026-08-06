import express from 'express';
import * as bookingController from '../controllers/bookingController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.post('/', requireAuth, authorize('TENANT'), bookingController.create);
router.get('/', requireAuth, authorize('TENANT'), bookingController.list);
router.get('/landlord', requireAuth, authorize('LANDLORD'), bookingController.listLandlord);
router.get('/admin', requireAuth, authorize('ADMIN'), bookingController.listAdmin);
router.patch('/:id/cancel', requireAuth, authorize('TENANT'), bookingController.cancel);
router.patch('/:id/approve', requireAuth, authorize('LANDLORD'), bookingController.approve);
router.patch('/:id/reject', requireAuth, authorize('LANDLORD'), bookingController.reject);
router.get('/:id', requireAuth, bookingController.get);

export default router;
