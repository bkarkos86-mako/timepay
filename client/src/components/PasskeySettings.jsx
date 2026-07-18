import { useEffect, useState, useCallback } from 'react';
import { startRegistration, browserSupportsWebAuthn, platformAuthenticatorIsAvailable } from '@simplewebauthn/browser';
import { api } from '../api/client';

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

// Lets an employee enroll the current device's Face ID / fingerprint /
// Windows Hello as a passkey, and manage previously enrolled devices.
// Password login always keeps working — this is purely additive.
export default function PasskeySettings() {
  const [supported, setSupported] = useState(false);
  const [passkeys, setPasskeys] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setPasskeys(await api.get('/auth/webauthn/credentials'));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const ok = browserSupportsWebAuthn() && (await platformAuthenticatorIsAvailable());
      setSupported(ok);
      if (ok) load();
    })();
  }, [load]);

  async function enroll() {
    setBusy(true);
    setError('');
    try {
      const options = await api.post('/auth/webauthn/register-options');
      const attestation = await startRegistration({ optionsJSON: options });
      // window.prompt() is unreliable in PWA standalone mode (iOS/Android) —
      // if it throws here, the biometric registration above already
      // succeeded on-device, so fall back to a default name rather than
      // losing that registration entirely.
      let nickname;
      try {
        nickname = window.prompt('Name this device (e.g. "My iPhone")', navigator.platform || 'This device') || undefined;
      } catch {
        nickname = navigator.platform || 'This device';
      }
      await api.post('/auth/webauthn/register-verify', { ...attestation, nickname });
      load();
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Enrollment was cancelled.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    await api.del(`/auth/webauthn/credentials/${id}`);
    load();
  }

  if (!supported) return null;

  return (
    <div className="card section">
      <h3>Face ID / fingerprint sign-in</h3>
      <p className="muted">Enroll this device once, then use it instead of typing your password.</p>
      {error && <div className="error-banner">{error}</div>}
      <table>
        <tbody>
          {passkeys.map((p) => (
            <tr key={p.id}>
              <td>{p.nickname || 'Unnamed device'}</td>
              <td className="muted">added {fmtDate(p.createdAt)}{p.lastUsedAt ? `, last used ${fmtDate(p.lastUsedAt)}` : ''}</td>
              <td>
                <button className="btn btn-secondary" onClick={() => remove(p.id)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {passkeys.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                No devices enrolled yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <button className="btn" style={{ marginTop: '0.6rem' }} onClick={enroll} disabled={busy}>
        {busy ? 'Enrolling…' : '+ Enable on this device'}
      </button>
    </div>
  );
}
