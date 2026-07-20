import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  const { login, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn());
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePasskeyLogin() {
    setBusy(true);
    setError('');
    try {
      await loginWithPasskey();
      navigate('/');
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError('Passkey sign-in was cancelled.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ marginBottom: 0 }}>TimePay</h1>
          <ThemeToggle />
        </div>
        <p>Time tracking & payroll</p>
        {error && <div className="error-banner">{error}</div>}

        {passkeySupported && (
          <>
            <button className="btn btn-block" type="button" onClick={handlePasskeyLogin} disabled={busy}>
              🔐 Sign in with Face ID / Fingerprint
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.9rem 0' }}>
              <div style={{ flex: 1, borderTop: '1px solid var(--border)' }} />
              <span className="muted">or</span>
              <div style={{ flex: 1, borderTop: '1px solid var(--border)' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingRight: '2.4rem', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  lineHeight: 1,
                  color: 'var(--text-muted)',
                  padding: '0.2rem',
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <button className="btn btn-secondary btn-block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in with password'}
          </button>
        </form>
        <p className="muted" style={{ marginTop: '1rem' }}>
          Demo accounts: admin@example.com / manager@example.com / employee@example.com — password123
        </p>
      </div>
    </div>
  );
}
