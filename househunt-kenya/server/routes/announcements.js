import express from 'express';
import * as announcementController from '../controllers/announcementController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', announcementController.list);
router.post('/', requireAuth, announcementController.create);

export default router;
