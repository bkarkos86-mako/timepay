import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL, isoUint8Array } from '@simplewebauthn/server/helpers';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { rpName, rpID, origin, storeChallenge, takeChallenge } from '../lib/webauthn.js';

export const webauthnRouter = Router();

function toCredential(passkey) {
  return {
    id: passkey.credentialId,
    publicKey: isoBase64URL.toBuffer(passkey.publicKey),
    counter: passkey.counter,
    transports: passkey.transports ? passkey.transports.split(',') : undefined,
  };
}

// ---------- Enrollment (requires an existing logged-in session) ----------

webauthnRouter.post('/register-options', requireAuth, async (req, res) => {
  const employee = await prisma.employee.findUnique({ where: { id: req.user.sub }, include: { passkeys: true } });

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: isoUint8Array.fromUTF8String(employee.id),
    userName: employee.email,
    userDisplayName: `${employee.firstName} ${employee.lastName}`,
    attestationType: 'none',
    excludeCredentials: employee.passkeys.map((p) => ({
      id: p.credentialId,
      transports: p.transports ? p.transports.split(',') : undefined,
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  storeChallenge(employee.id, options.challenge);
  res.json(options);
});

webauthnRouter.post('/register-verify', requireAuth, async (req, res) => {
  const expectedChallenge = takeChallenge(req.user.sub);
  if (!expectedChallenge) return res.status(400).json({ error: 'Registration challenge expired — try again' });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!verification.verified) return res.status(400).json({ error: 'Could not verify passkey' });

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const passkey = await prisma.passkey.create({
    data: {
      employeeId: req.user.sub,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports?.join(',') ?? null,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      nickname: req.body.nickname || null,
    },
  });

  res.status(201).json({ id: passkey.id, nickname: passkey.nickname, createdAt: passkey.createdAt });
});

webauthnRouter.get('/credentials', requireAuth, async (req, res) => {
  const passkeys = await prisma.passkey.findMany({
    where: { employeeId: req.user.sub },
    select: { id: true, nickname: true, deviceType: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(passkeys);
});

webauthnRouter.delete('/credentials/:id', requireAuth, async (req, res) => {
  const passkey = await prisma.passkey.findUnique({ where: { id: req.params.id } });
  if (!passkey || passkey.employeeId !== req.user.sub) return res.status(404).json({ error: 'Not found' });
  await prisma.passkey.delete({ where: { id: passkey.id } });
  res.status(204).end();
});

// ---------- Usernameless login (no session yet) ----------

webauthnRouter.post('/login-options', async (req, res) => {
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: 'preferred',
    // No allowCredentials: lets the browser/OS show every passkey it has
    // stored for this site (discoverable/resident credentials), so the
    // employee doesn't have to type an email first.
  });

  const token = crypto.randomUUID();
  storeChallenge(token, options.challenge);
  res.json({ token, options });
});

webauthnRouter.post('/login-verify', async (req, res) => {
  const { token, response } = req.body;
  const expectedChallenge = takeChallenge(token);
  if (!expectedChallenge) return res.status(400).json({ error: 'Login challenge expired — try again' });

  const passkey = await prisma.passkey.findUnique({ where: { credentialId: response.id }, include: { employee: true } });
  if (!passkey) return res.status(400).json({ error: 'This passkey is not registered' });

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: toCredential(passkey),
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!verification.verified) return res.status(400).json({ error: 'Could not verify passkey' });

  const employee = passkey.employee;
  if (employee.employmentStatus !== 'ACTIVE') return res.status(403).json({ error: 'Account is not active' });

  await prisma.passkey.update({
    where: { id: passkey.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });

  const jwtToken = jwt.sign(
    { sub: employee.id, systemRole: employee.systemRole, email: employee.email },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token: jwtToken,
    employee: {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      systemRole: employee.systemRole,
    },
  });
});
