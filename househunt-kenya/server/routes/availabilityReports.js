import express from 'express';
import * as availabilityReportController from '../controllers/availabilityReportController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.post(
  '/properties/:propertyId',
  requireAuth,
  authorize('TENANT'),
  availabilityReportController.create
);
router.get('/', requireAuth, authorize('ADMIN'), availabilityReportController.list);
router.patch('/:id', requireAuth, authorize('ADMIN'), availabilityReportController.review);

export default router;
