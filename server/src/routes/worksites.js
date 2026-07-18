import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const worksitesRouter = Router();
worksitesRouter.use(requireAuth);

// Readable by anyone logged in — not sensitive, and an employee flagged for
// being outside a geofence may reasonably want to see why.
worksitesRouter.get('/', async (req, res) => {
  res.json(await prisma.worksite.findMany({ orderBy: { name: 'asc' } }));
});

worksitesRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const { name, lat, lng, radiusMeters = 150, isActive = true } = req.body;
  if (!name || lat == null || lng == null) {
    return res.status(400).json({ error: 'name, lat, and lng are required' });
  }
  const worksite = await prisma.worksite.create({
    data: { name, lat: Number(lat), lng: Number(lng), radiusMeters: Number(radiusMeters), isActive },
  });
  res.status(201).json(worksite);
});

worksitesRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const { name, lat, lng, radiusMeters, isActive } = req.body;
  const worksite = await prisma.worksite.update({
    where: { id: req.params.id },
    data: {
      name,
      lat: lat != null ? Number(lat) : undefined,
      lng: lng != null ? Number(lng) : undefined,
      radiusMeters: radiusMeters != null ? Number(radiusMeters) : undefined,
      isActive,
    },
  });
  res.json(worksite);
});

worksitesRouter.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  await prisma.worksite.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
