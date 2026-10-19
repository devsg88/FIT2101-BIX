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

  const transporter = nodemailer.createTransport({
    service: 'gmail',
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
