import express from 'express';
import * as propertyController from '../controllers/propertyController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.get('/', propertyController.list);
router.post('/', requireAuth, propertyController.create);
router.get('/:id', propertyController.get);
router.patch('/:id', requireAuth, propertyController.update);
router.delete('/:id', requireAuth, propertyController.remove);
router.patch('/:id/approve', requireAuth, authorize('ADMIN'), propertyController.approve);
router.patch('/:id/status', requireAuth, authorize('ADMIN'), propertyController.updateStatus);
router.patch('/:id/feature', requireAuth, authorize('ADMIN'), propertyController.feature);

export default router;
