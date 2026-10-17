// US-14 — Yichi Zhang
// Login only required a non-empty password. Reset uses a minimum length so
// recovered accounts are not left with trivial secrets.

export const MIN_PASSWORD_LENGTH = 8;

// NFR-01 security baseline. Every place that hashes a new password (reset
// today, any future "create account"/"admin sets password" flow) should
// import this rather than writing its own literal 10.
export const BCRYPT_COST_FACTOR = 10;

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
