import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(process.cwd(), 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

function imageFileFilter(req, file, cb) {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image uploads are allowed'));
  }
  cb(null, true);
}

export const uploadPhoto = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
