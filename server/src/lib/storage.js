import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const bucket = process.env.SUPABASE_BUCKET || 'timepay-uploads';

// Only set in production (see server/.env.example) — local dev has no
// Supabase project and falls back to the local uploads/ folder below.
const supabase =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

// Clock-in/out and geofence-verification photos. Uploaded to Supabase
// Storage when configured — survives redeploys, unlike local disk on free
// hosting, which gets wiped every time. Falls back to writing into the
// local uploads/ folder when Supabase isn't configured, so local dev needs
// zero external setup.
export async function savePhoto(file) {
  if (!file) return null;

  const ext = path.extname(file.originalname) || '.jpg';
  const filename = `${crypto.randomUUID()}${ext}`;

  if (supabase) {
    const { error } = await supabase.storage.from(bucket).upload(filename, file.buffer, { contentType: file.mimetype });
    if (error) throw new Error(`Photo upload failed: ${error.message}`);
    return supabase.storage.from(bucket).getPublicUrl(filename).data.publicUrl;
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, filename), file.buffer);
  return `/uploads/${filename}`;
}
