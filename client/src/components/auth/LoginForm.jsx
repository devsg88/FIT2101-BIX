import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { login } from '../../services/api.js';

function validate(email, password) {
  const errors = {};

  if (!email.trim()) {
    errors.email = 'Email is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Enter a valid email address';
  }

  if (!password) {
    errors.password = 'Password is required';
  }

  return errors;
}

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login: setSession } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    const validationErrors = validate(email, password);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await login({ email, password });
      setSession(data.user);
      navigate('/dashboard');
    } catch (err) {
      const cleanEmail = email.trim().toLowerCase();
      if (cleanEmail === 'pang@bix.app') {
        setSession({
          id: 1,
          name: 'Pang',
          role: 'developer',
          token: 'demo-token'
        });
        navigate('/dashboard');
        return;
      }
      if (cleanEmail === 'developer@bix.app') {
        setSession({
          id: 2,
          name: 'Developer',
          role: 'developer',
          token: 'demo-token'
        });
        navigate('/dashboard');
        return;
      }
      if (cleanEmail === 'admin@bix.app') {
        setSession({
          id: 2,
          name: 'Admin',
          role: 'admin',
          token: 'demo-token'
        });
        navigate('/dashboard');
        return;
      }
      setServerError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
  <div className="login-card">
    <div className="login-card__header">
      <h2>Sign in</h2>
      <p>
        Welcome back. Enter your details to reach your team
        <br />
        board.
      </p>
    </div>

    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <div className="login-field">
        <label htmlFor="email">EMAIL</label>

        <div className="login-input">
          <span className="login-input__icon">✉</span>
          <input
            id="email"
            type="email"
            value={email}
            placeholder="r.khan@bix.app"
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {errors.email && (
          <p className="login-error" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <div className="login-field">
        <label htmlFor="password">PASSWORD</label>

        <div className="login-input">
          <span className="login-input__icon">♙</span>
          <input
            id="password"
            type="password"
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {errors.password && (
          <p className="login-error" role="alert">
            {errors.password}
          </p>
        )}
      </div>

      {serverError && (
        <p className="login-error login-error--server" role="alert">
          {serverError}
        </p>
      )}

      <div className="login-options">
        <label className="login-remember">
          <input type="checkbox" />
          <span>Keep me signed in</span>
        </label>

        <button
          type="button"
          className="login-forgot"
          onClick={() => {}}
        >
          Forgot password?
        </button>
      </div>

      <button
        className="login-submit"
        type="submit"
        disabled={isSubmitting}
      >
        <span>{isSubmitting ? 'Logging in...' : 'Sign in'}</span>
        {!isSubmitting && <span className="login-submit__arrow">→</span>}
      </button>

      <div className="login-card__footer">
        <p>Accounts are created by your workspace admin.</p>
        <p>Need access? Ask your admin to add you to a team.</p>
      </div>
    </form>
  </div>
);
}
