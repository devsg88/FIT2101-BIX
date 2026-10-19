import nodemailer from 'nodemailer';

// US-14 — real outbound delivery, alongside the local demo mailbox.
// Only attempts to send when SMTP_EMAIL/SMTP_APP_PASSWORD are both set, so
// local development (neither configured) behaves exactly as before: no
// attempt, no error, nothing logged. SMTP_EMAIL is a Gmail address with
// 2-Step Verification enabled; SMTP_APP_PASSWORD is an App Password
// generated for it (Google Account -> Security -> 2-Step Verification ->
// App passwords) - never the account's real password. See
// server/.env.example.
export async function sendPasswordResetEmail({ to, resetUrl }) {
  const { SMTP_EMAIL, SMTP_APP_PASSWORD } = process.env;
  if (!SMTP_EMAIL || !SMTP_APP_PASSWORD) {
    return { sent: false, reason: 'not-configured' };
  }

  // Explicit host/port 587 (STARTTLS) rather than the `service: 'gmail'`
  // shorthand, which defaults to port 465 (implicit SSL). Render's free web
  // services block outbound SMTP on 465 - connections to it hang until
  // nodemailer's own timeout, logged here as "Connection timeout" - but
  // generally allow 587, the more common port for an app submitting mail
  // (as opposed to a mail server relaying it) to use.
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: { user: SMTP_EMAIL, pass: SMTP_APP_PASSWORD }
  });

  await transporter.sendMail({
    from: `"BIX" <${SMTP_EMAIL}>`,
    to,
    subject: 'Reset your BIX password',
    text: `Use the link below to choose a new password. It expires in one hour and can be used only once.\n\n${resetUrl}`,
    html:
      '<p>Use the link below to choose a new password. It expires in one hour and can be used only once.</p>' +
      `<p><a href="${resetUrl}">${resetUrl}</a></p>`
  });

  return { sent: true };
}
