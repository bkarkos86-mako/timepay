import { Router } from 'express';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

export const pushRouter = Router();

pushRouter.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

pushRouter.use(requireAuth);

pushRouter.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: 'endpoint and keys.p256dh/keys.auth are required' });
  }
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { employeeId: req.user.sub, p256dh: keys.p256dh, auth: keys.auth },
    create: { employeeId: req.user.sub, endpoint, p256dh: keys.p256dh, auth: keys.auth },
  });
  res.status(201).json({ id: sub.id });
});

pushRouter.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
  await prisma.pushSubscription.deleteMany({ where: { endpoint, employeeId: req.user.sub } });
  res.status(204).end();
});

pushRouter.get('/subscriptions', async (req, res) => {
  const subs = await prisma.pushSubscription.findMany({
    where: { employeeId: req.user.sub },
    select: { id: true, endpoint: true, createdAt: true },
  });
  res.json(subs);
});
