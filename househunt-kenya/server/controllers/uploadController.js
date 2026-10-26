import { uploadPropertyMedia } from '../services/mediaUploadService.js';

export async function uploadPropertyMediaFiles(req, res) {
  try {
    const media = await uploadPropertyMedia(req.file, req.user?.id);
    return res.status(201).json({
      success: true,
      message: 'Property media uploaded and optimized successfully',
      data: { media },
      errors: [],
    });
  } catch (error) {
    const status = error.status || 502;
    return res.status(status).json({
      success: false,
      message: error.message || 'Unable to upload property media.',
      data: null,
      errors: [{ field: 'files', message: error.message || 'Unable to upload property media.' }],
    });
  }
}
