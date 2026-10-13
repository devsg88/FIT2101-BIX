import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../services/api.js';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setConfirmation('');

    if (!token) {
      setError('This reset link is invalid or has expired. You can request another reset.');
      return;
    }
    if (!password) {
      setError('A new password is required');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError('Password confirmation does not match');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await resetPassword({
        token,
        password,
        confirm_password: confirmPassword
      });
      setConfirmation(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-panel login-panel--solo">
        <div className="login-card">
          <div className="login-card__header">
            <h2>Reset password</h2>
            <p>Choose a new password for your account.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="new-password">NEW PASSWORD</label>
              <div className="login-input">
                <span className="login-input__icon">♙</span>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  placeholder="At least 8 characters"
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="confirm-password">CONFIRM PASSWORD</label>
              <div className="login-input">
                <span className="login-input__icon">♙</span>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  placeholder="Repeat the new password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="login-error login-error--server" role="alert">
                {error}
              </p>
            )}

            {confirmation && (
              <p className="login-notice" role="status">
                {confirmation}
              </p>
            )}

            <button className="login-submit" type="submit" disabled={isSubmitting || Boolean(confirmation)}>
              <span>{isSubmitting ? 'Saving...' : 'Update password'}</span>
            </button>

            <p className="login-card__footer">
              <Link to="/forgot-password">Request another reset</Link>
              {' · '}
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
