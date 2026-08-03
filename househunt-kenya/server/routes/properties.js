import express from 'express';
import * as propertyController from '../controllers/propertyController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', propertyController.list);
router.post('/', requireAuth, propertyController.create);
router.get('/:id', propertyController.get);
router.put('/:id', requireAuth, propertyController.update);
router.delete('/:id', requireAuth, propertyController.remove);

export default router;
