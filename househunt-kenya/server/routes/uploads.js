import express from 'express';
import multer from 'multer';
import * as uploadController from '../controllers/uploadController.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';

const MAX_MEDIA_SIZE = 50 * 1024 * 1024;
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MEDIA_SIZE },
  fileFilter(req, file, callback) {
    const supported = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/avif',
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ];
    if (!supported.includes(file.mimetype)) {
      const error = new Error('Use JPEG, PNG, WebP, or AVIF photos, or MP4, WebM, or MOV videos.');
      error.status = 400;
      callback(error);
      return;
    }
    callback(null, true);
  },
});

router.post(
  '/property-media',
  authenticate,
  authorize('LANDLORD', 'ADMIN'),
  upload.single('file'),
  (error, req, res, next) => {
    if (!error) return next();
    const status = error.code === 'LIMIT_FILE_SIZE' || error.code === 'LIMIT_UNEXPECTED_FILE'
      ? 400
      : error.status || 400;
    return res.status(status).json({
      success: false,
      message: error.code === 'LIMIT_FILE_SIZE'
        ? 'Each photo or video must be 50 MB or smaller.'
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Upload one photo or video at a time.'
          : error.message || 'Unable to receive the selected media.',
      data: null,
      errors: [{ field: 'files', message: error.message || 'Invalid media upload.' }],
    });
  },
  uploadController.uploadPropertyMediaFiles
);

export default router;
