import multer from 'multer';

function imageFileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image uploads are allowed'));
  }
  cb(null, true);
}

// Buffers in memory rather than writing to disk directly — lib/storage.js
// decides where the buffer actually ends up (Supabase Storage in production,
// local uploads/ folder in dev).
export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
