import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

// Handles a tap on a covert location spot-check push notification. Silent by
// design: no visible UI, no confirmation, no error message — from the
// employee's perspective, tapping the notification just opens the app
// normally. See PingChallenge in schema.prisma for why this exists.
export default function PingChallengeResponder() {
  const { employee } = useAuth();

  useEffect(() => {
    if (!employee) return;

    const params = new URLSearchParams(window.location.search);
    const challengeId = params.get('pingChallenge');
    const entryId = params.get('entryId');
    if (!challengeId || !entryId) return;

    // Strip immediately so a later refresh/share of the URL doesn't re-trigger this.
    params.delete('pingChallenge');
    params.delete('entryId');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));

    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        api
          .post(`/time-entries/${entryId}/ping-challenges/${challengeId}/respond`, {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          })
          .catch(() => {});
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [employee]);

  return null;
}
