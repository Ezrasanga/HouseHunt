import express from 'express';
import * as bookingController from '../controllers/bookingController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', requireAuth, bookingController.create);
router.get('/', requireAuth, bookingController.list);
router.get('/:id', requireAuth, bookingController.get);

export default router;
