import { findUserByEmail } from '../models/userModel.js';
import { createPasswordResetToken } from '../models/passwordResetModel.js';
import { deliverPasswordResetToken } from '../services/resetTokenDelivery.js';

// US-14 — Yichi Zhang (SCRUM-170)
// Always the same confirmation, whether or not the email is registered.

export const FORGOT_PASSWORD_CONFIRMATION =
  'If an account exists for that email, we have sent password reset instructions.';

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function isEmailShape(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function forgotPasswordController(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email || !isEmailShape(email)) {
    return res.status(400).json({ message: 'A valid email is required' });
  }

  try {
    const user = await findUserByEmail(email);
    if (user) {
      const { rawToken } = await createPasswordResetToken(user.id);
      deliverPasswordResetToken({ email, rawToken });
    }
    return res.json({ message: FORGOT_PASSWORD_CONFIRMATION });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to process the password reset request' });
  }
}
