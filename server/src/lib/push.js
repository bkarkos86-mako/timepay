import webpush from 'web-push';
import { prisma } from '../db.js';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function sendPushToEmployee(employeeId, payload) {
  const subs = await prisma.pushSubscription.findMany({ where: { employeeId } });
  await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload))
        .catch(async (err) => {
          // 404/410 means the browser unsubscribed or the subscription expired — clean it up.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          }
        })
    )
  );
}

export async function sendPushToRoles(roles, payload) {
  const employees = await prisma.employee.findMany({ where: { systemRole: { in: roles } } });
  await Promise.all(employees.map((e) => sendPushToEmployee(e.id, payload)));
}
