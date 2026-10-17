import bcrypt from 'bcrypt';
import { BCRYPT_COST_FACTOR, validateNewPassword } from '../constants/passwordRules.js';
import { findUserByEmail, updateUserPasswordHash } from '../models/userModel.js';
import {
  createPasswordResetToken,
  describeResetTokenState,
  findResetTokenByRawToken,
  invalidateUnusedTokensForUser,
  markResetTokenUsed
} from '../models/passwordResetModel.js';
import { deliverPasswordResetToken } from '../services/resetTokenDelivery.js';
import { listDemoMailboxMessages } from '../services/demoMailboxStore.js';

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

export function getDemoMailboxController(req, res) {
  return res.json({ messages: listDemoMailboxMessages() });
}

export const RESET_TOKEN_UNUSABLE_MESSAGE =
  'This reset link is invalid or has expired. You can request another reset.';

export async function resetPasswordController(req, res) {
  const rawToken = String(req.body?.token ?? '').trim();
  const password = req.body?.password;
  const confirmPassword = req.body?.confirm_password ?? req.body?.confirmPassword;

  if (!rawToken) {
    return res.status(400).json({ message: RESET_TOKEN_UNUSABLE_MESSAGE });
  }

  const passwordError = validateNewPassword(password, confirmPassword);
  if (passwordError) {
    return res.status(400).json({ message: passwordError });
  }

  try {
    const row = await findResetTokenByRawToken(rawToken);
    const state = describeResetTokenState(row);
    if (state !== 'valid') {
      return res.status(400).json({ message: RESET_TOKEN_UNUSABLE_MESSAGE });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);
    const updated = await updateUserPasswordHash(row.user_id, passwordHash);
    if (!updated) {
      return res.status(400).json({ message: RESET_TOKEN_UNUSABLE_MESSAGE });
    }

    await markResetTokenUsed(row.id);
    await invalidateUnusedTokensForUser(row.user_id);

    return res.json({
      message: 'Your password has been reset. You can now sign in with the new password.'
    });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to reset the password' });
  }
}
