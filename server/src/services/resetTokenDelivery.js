import { addDemoMailboxMessage } from './demoMailboxStore.js';
import { sendPasswordResetEmail } from './emailSender.js';

// US-14 — Yichi Zhang (SCRUM-171)
// Recovery channel: the account's registered email.
// Always delivered to the local demo mailbox; also attempts real delivery
// via sendPasswordResetEmail (emailSender.js) when SMTP is configured. The
// forgot-password HTTP response never includes the token either way.

export function buildPasswordResetUrl(rawToken, origin = process.env.APP_ORIGIN) {
  const base = String(origin || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function deliverPasswordResetToken({ email, rawToken }) {
  const resetUrl = buildPasswordResetUrl(rawToken);

  addDemoMailboxMessage({
    to: email,
    subject: 'Reset your BIX password',
    body: `Use the link below to choose a new password. It expires in one hour and can be used only once.\n\n${resetUrl}`,
    resetUrl
  });

  // A failed send must never change what forgotPasswordController tells the
  // caller - it always returns the same generic confirmation regardless, so
  // this endpoint can't be used to check which emails have an account.
  // Logged server-side, never thrown.
  try {
    await sendPasswordResetEmail({ to: email, resetUrl });
  } catch (err) {
    console.error(`[password-reset] failed to email ${email}: ${err.message}`);
  }

  return { channel: 'email', resetUrl };
}
