// US-14 - real outbound delivery, alongside the local demo mailbox.
//
// Originally sent via Gmail SMTP (nodemailer); switched to Brevo's HTTP
// transactional-email API after confirming, from the deployed Render
// instance's own logs, that both SMTP port 465 and 587 time out
// identically - Render blocks outbound SMTP entirely on this tier, a
// common anti-spam measure on shared/free hosting. An HTTPS API call has no
// such restriction, since it is the exact same kind of request the rest of
// this app already makes.
//
// Only attempts to send when BREVO_API_KEY/BREVO_SENDER_EMAIL are both set,
// so local development (neither configured) behaves exactly as before: no
// attempt, no error, nothing logged. BREVO_SENDER_EMAIL must be a sender
// verified in the Brevo account the API key belongs to (Brevo dashboard ->
// Senders, Domains & Dedicated IPs) - sending from an unverified address is
// rejected by Brevo itself, not something this code enforces.
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export async function sendPasswordResetEmail({ to, resetUrl }) {
  const { BREVO_API_KEY, BREVO_SENDER_EMAIL } = process.env;
  if (!BREVO_API_KEY || !BREVO_SENDER_EMAIL) {
    return { sent: false, reason: 'not-configured' };
  }

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': BREVO_API_KEY
    },
    body: JSON.stringify({
      sender: { name: 'BIX', email: BREVO_SENDER_EMAIL },
      to: [{ email: to }],
      subject: 'Reset your BIX password',
      textContent: `Use the link below to choose a new password. It expires in one hour and can be used only once.\n\n${resetUrl}`,
      htmlContent:
        '<p>Use the link below to choose a new password. It expires in one hour and can be used only once.</p>' +
        `<p><a href="${resetUrl}">${resetUrl}</a></p>`
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo API responded ${response.status}: ${body}`);
  }

  return { sent: true };
}
