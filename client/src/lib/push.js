import { api } from '../api/client';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enablePushNotifications() {
  if (!pushSupported()) throw new Error('Push notifications are not supported in this browser.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  const { publicKey } = await api.get('/push/vapid-public-key');
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const json = subscription.toJSON();
  await api.post('/push/subscribe', { endpoint: json.endpoint, keys: json.keys });
  return subscription;
}

export async function disablePushNotifications() {
  const sub = await getExistingSubscription();
  if (!sub) return;
  await api.post('/push/unsubscribe', { endpoint: sub.endpoint });
  await sub.unsubscribe();
}
