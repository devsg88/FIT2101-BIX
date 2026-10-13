// US-14 — Yichi Zhang (SCRUM-171)
// Recovery channel: the account's registered email.
// This walking skeleton has no outbound mailer, so delivery is logged for
// local/demo use. The HTTP response never includes the token.

export function buildPasswordResetUrl(rawToken, origin = process.env.APP_ORIGIN) {
  const base = String(origin || 'http://localhost:5173').replace(/\/$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export function deliverPasswordResetToken({ email, rawToken }) {
  const resetUrl = buildPasswordResetUrl(rawToken);
  console.info(`[US-14] Password reset for ${email}: ${resetUrl}`);
  return { channel: 'email', resetUrl };
}
