import assert from 'node:assert/strict';
import test from 'node:test';
import { Buffer } from 'node:buffer';
import { validateMediaFile, uploadPropertyMedia } from '../services/mediaUploadService.js';

test('media upload accepts supported image files based on their file signatures', async () => {
  const type = await validateMediaFile({
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    size: 4,
    mimetype: 'image/jpeg',
  });
  assert.equal(type, 'image');
});

test('media upload rejects unsupported and mismatched file types', async () => {
  await assert.rejects(
    validateMediaFile({ buffer: Buffer.from('not an image'), size: 12, mimetype: 'image/jpeg' }),
    { status: 400 }
  );
  await assert.rejects(
    validateMediaFile({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), size: 4, mimetype: 'video/mp4' }),
    { status: 400 }
  );
});

test('media upload rejects files over the maximum size and missing file input', async () => {
  await assert.rejects(
    validateMediaFile({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]), size: 50 * 1024 * 1024 + 1, mimetype: 'image/jpeg' }),
    { status: 400 }
  );
  await assert.rejects(uploadPropertyMedia(null), { status: 400 });
});
