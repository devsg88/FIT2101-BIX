import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDemoMailbox } from '../services/api.js';

export default function DemoMailbox() {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDemoMailbox()
      .then((data) => {
        if (!cancelled) {
          setMessages(data.messages || []);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="login-page">
      <section className="login-panel login-panel--solo">
        <div className="login-card mailbox-card">
          <div className="login-card__header">
            <h2>Demo inbox</h2>
            <p>
              Local stand-in for email. This project does not send real mail.
              Reset messages appear here only when the address belongs to an account.
            </p>
          </div>

          {isLoading && <p className="mailbox-empty">Loading...</p>}
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          {!isLoading && !error && messages.length === 0 && (
            <p className="mailbox-empty">No messages yet.</p>
          )}

          <ul className="mailbox-list">
            {messages.map((message) => (
              <li key={message.id} className="mailbox-item">
                <p className="mailbox-item__meta">
                  <strong>To</strong> {message.to}
                </p>
                <p className="mailbox-item__subject">{message.subject}</p>
                <pre className="mailbox-item__body">{message.body}</pre>
                {message.resetUrl && (
                  <a className="login-submit mailbox-item__link" href={message.resetUrl}>
                    Open reset link
                  </a>
                )}
              </li>
            ))}
          </ul>

          <p className="login-card__footer">
            <Link to="/forgot-password">Back to forgot password</Link>
            {' · '}
            <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
