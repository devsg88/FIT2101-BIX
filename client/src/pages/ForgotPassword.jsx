import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../services/api.js';

function isEmailShape(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setConfirmation('');

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Email is required');
      return;
    }
    if (!isEmailShape(trimmed)) {
      setError('Enter a valid email address');
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await requestPasswordReset(trimmed);
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
            <h2>Forgot password</h2>
            <p>Enter the email on your account. We will send reset instructions if it is registered.</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div className="login-field">
              <label htmlFor="reset-email">EMAIL</label>
              <div className="login-input">
                <span className="login-input__icon">✉</span>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  placeholder="r.khan@bix.app"
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="login-error login-error--server" role="alert">
                {error}
              </p>
            )}

            {confirmation && (
              <>
                <p className="login-notice" role="status">
                  {confirmation}
                </p>
                {import.meta.env.VITE_DEMO_MAILBOX_ENABLED === 'true' && (
                  <p className="login-card__footer">
                    Local dev: real email isn&apos;t set up on this machine.
                    {' '}
                    <Link to="/demo-mailbox">Open demo inbox</Link>
                  </p>
                )}
              </>
            )}

            <button className="login-submit" type="submit" disabled={isSubmitting}>
              <span>{isSubmitting ? 'Sending...' : 'Send reset instructions'}</span>
            </button>

            <p className="login-card__footer">
              <Link to="/login">Back to sign in</Link>
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
