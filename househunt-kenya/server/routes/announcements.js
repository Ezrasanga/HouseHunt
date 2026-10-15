import express from 'express';
import * as announcementController from '../controllers/announcementController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.get('/', announcementController.list);
router.post('/', requireAuth, authorize('ADMIN'), announcementController.create);

export default router;
