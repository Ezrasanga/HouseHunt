import express from 'express';
import * as propertyController from '../controllers/propertyController.js';
import { authenticate } from '../middleware/authenticate.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return next();
  }

  return authenticate(req, res, next);
};

router.get('/', optionalAuth, propertyController.list);
router.post('/', requireAuth, propertyController.create);
router.get('/:id', optionalAuth, propertyController.get);
router.patch('/:id', requireAuth, propertyController.update);
router.delete('/:id', requireAuth, propertyController.remove);
router.patch('/:id/approve', requireAuth, authorize('ADMIN'), propertyController.approve);
router.patch('/:id/status', requireAuth, authorize('ADMIN'), propertyController.updateStatus);
router.patch('/:id/feature', requireAuth, authorize('ADMIN'), propertyController.feature);

export default router;
