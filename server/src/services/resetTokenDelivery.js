import { addDemoMailboxMessage } from './demoMailboxStore.js';

// US-14 — Yichi Zhang (SCRUM-171)
// Recovery channel: the account's registered email.
// There is no SMTP server in this walking skeleton, so the message is
// delivered to the local demo mailbox instead. The forgot-password HTTP
// response never includes the token.

export function buildPasswordResetUrl(rawToken, origin = process.env.APP_ORIGIN) {
  const base = String(origin || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export function deliverPasswordResetToken({ email, rawToken }) {
  const resetUrl = buildPasswordResetUrl(rawToken);
  addDemoMailboxMessage({
    to: email,
    subject: 'Reset your BIX password',
    body: `Use the link below to choose a new password. It expires in one hour and can be used only once.\n\n${resetUrl}`,
    resetUrl
  });
  return { channel: 'email', resetUrl };
}
