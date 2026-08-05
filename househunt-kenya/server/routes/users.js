import express from 'express';
import * as userController from '../controllers/userController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.get('/profile', authenticate, userController.getProfile);
router.patch('/profile', authenticate, userController.updateProfile);
router.patch('/change-password', authenticate, userController.changePassword);

router.get('/', authenticate, authorize('ADMIN'), userController.list);
router.get('/:id', authenticate, authorize('ADMIN'), userController.get);
router.patch('/:id/status', authenticate, authorize('ADMIN'), userController.updateStatus);
router.delete('/:id', authenticate, authorize('ADMIN'), userController.remove);

export default router;
