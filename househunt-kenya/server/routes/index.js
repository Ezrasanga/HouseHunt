import express from 'express';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import propertyRoutes from './properties.js';
import paymentRoutes from './payments.js';
import bookingRoutes from './bookings.js';
import announcementRoutes from './announcements.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/properties', propertyRoutes);
router.use('/payments', paymentRoutes);
router.use('/bookings', bookingRoutes);
router.use('/announcements', announcementRoutes);

router.get('/', (req, res) => res.json({ success: true, message: 'API root' }));

export default router;
