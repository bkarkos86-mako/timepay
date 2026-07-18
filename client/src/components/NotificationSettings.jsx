import { useEffect, useState } from 'react';
import { pushSupported, getExistingSubscription, enablePushNotifications, disablePushNotifications } from '../lib/push';

// Push alerts are used for: an employee wandering outside a geofenced
// worksite while clocked in (both they and admins/managers get notified),
// and any future push-worthy event. Off by default — an explicit opt-in per
// device, same as passkeys.
export default function NotificationSettings() {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const ok = pushSupported();
    setSupported(ok);
    if (ok) getExistingSubscription().then((sub) => setSubscribed(!!sub));
  }, []);

  async function enable() {
    setBusy(true);
    setError('');
    try {
      await enablePushNotifications();
      setSubscribed(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError('');
    try {
      await disablePushNotifications();
      setSubscribed(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="card section">
      <h3>Notifications</h3>
      <p className="muted">
        Get alerted on this device if you're clocked in and leave the worksite area, or (for managers/admins) when an employee
        does.
      </p>
      {error && <div className="error-banner">{error}</div>}
      <button className="btn" onClick={subscribed ? disable : enable} disabled={busy}>
        {busy ? 'Working…' : subscribed ? 'Disable notifications on this device' : 'Enable notifications on this device'}
      </button>
    </div>
  );
}
