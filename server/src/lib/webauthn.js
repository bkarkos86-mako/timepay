// WebAuthn (passkey) config. rpID must be a bare domain (no scheme/port) and
// must match what the browser's origin resolves to — "localhost" works for
// any localhost port in dev. Override both via env vars once this is served
// from a real domain over HTTPS (WebAuthn requires a secure context).
export const rpName = process.env.WEBAUTHN_RP_NAME || 'TimePay';
export const rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
export const origin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:5183';

// In-memory challenge store, keyed by employeeId (registration) or a random
// one-time token (usernameless login, where we don't know the employee until
// after the assertion comes back). Fine for a single-process server; swap for
// Redis or a DB table if this ever runs behind multiple instances.
const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function storeChallenge(key, challenge) {
  challenges.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

export function takeChallenge(key) {
  const entry = challenges.get(key);
  challenges.delete(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.challenge;
}
