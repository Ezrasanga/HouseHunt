import { randomUUID } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import { v2 as cloudinary } from 'cloudinary';

const MAX_MEDIA_SIZE = 50 * 1024 * 1024;
const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function createUploadError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function validateMediaFile(file) {
  if (!file?.buffer || file.size > MAX_MEDIA_SIZE) {
    throw createUploadError('Each photo or video must be 50 MB or smaller.');
  }
  const detectedType = await fileTypeFromBuffer(file.buffer);
  const isImage = IMAGE_MIMES.has(detectedType?.mime) && IMAGE_MIMES.has(file.mimetype);
  const isVideo = VIDEO_MIMES.has(detectedType?.mime) && VIDEO_MIMES.has(file.mimetype);
  if (!isImage && !isVideo) {
    throw createUploadError('Use JPEG, PNG, WebP, or AVIF photos, or MP4, WebM, or MOV videos.');
  }
  return isImage ? 'image' : 'video';
}

function configureCloudinary() {
  const env = globalThis.process?.env || {};
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw createUploadError('Media uploads are not configured. Set the Cloudinary credentials on the server.', 503);
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

function optimizedDeliveryUrl(publicId, type) {
  const transformation = type === 'image'
    ? [{ width: 1920, height: 1440, crop: 'limit', quality: 'auto', fetch_format: 'auto' }]
    : [{ width: 1280, height: 720, crop: 'limit', quality: 'auto:good', fetch_format: 'auto' }];
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: type === 'video' ? 'video' : 'image',
    transformation,
  });
}

export async function uploadPropertyMedia(file, ownerId) {
  if (!file) throw createUploadError('Select an image or video to upload.');
  if (!ownerId) throw createUploadError('Authentication required.', 401);
  const type = await validateMediaFile(file);
  configureCloudinary();

  try {
    const result = await uploadBuffer(file.buffer, {
      folder: `househunt/properties/${ownerId}`,
      public_id: randomUUID(),
      resource_type: type === 'video' ? 'video' : 'image',
      overwrite: false,
    });
    return {
      url: optimizedDeliveryUrl(result.public_id, type),
      type,
      publicId: result.public_id,
    };
  } catch (error) {
    throw createUploadError(error.message || 'Cloudinary could not process the selected media.', 502);
  }
}
