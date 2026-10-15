import express from 'express';
import * as auditController from '../controllers/auditController.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { authorize } from '../middleware/authorize.js';

const router = express.Router();

router.get('/', requireAuth, authorize('ADMIN'), auditController.list);

export default router;
