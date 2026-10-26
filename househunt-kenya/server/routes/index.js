import express from 'express';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import propertyRoutes from './properties.js';
import paymentRoutes from './payments.js';
import bookingRoutes from './bookings.js';
import announcementRoutes from './announcements.js';
import auditRoutes from './audit.js';
import availabilityReportRoutes from './availabilityReports.js';
import uploadRoutes from './uploads.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/properties', propertyRoutes);
router.use('/payments', paymentRoutes);
router.use('/bookings', bookingRoutes);
router.use('/announcements', announcementRoutes);
router.use('/audit', auditRoutes);
router.use('/availability-reports', availabilityReportRoutes);
router.use('/uploads', uploadRoutes);

router.get('/', (req, res) => res.json({ success: true, message: 'API root' }));

export default router;
