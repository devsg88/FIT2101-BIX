// US-14 — Yichi Zhang
// Login only required a non-empty password. Reset uses a minimum length so
// recovered accounts are not left with trivial secrets.

export const MIN_PASSWORD_LENGTH = 8;

export function validateNewPassword(password, confirmPassword) {
  if (!password) {
    return 'A new password is required';
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return 'Password confirmation does not match';
  }
  return null;
}
