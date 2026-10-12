// NFR-01: action-level 403s (e.g. a Developer's stale UI still showing a
// delete button the backend will now refuse) stay inline, right where the
// action was attempted - never a full navigation away, unlike a page-level
// 403 (see AccessDenied.jsx). This only adds a small icon so "you're not
// permitted" reads differently at a glance from "something broke, retry" -
// the backend's own message (already specific, e.g. "You are not a member
// of this project") is still shown as-is, not replaced by a generic line.
//
// `error` is the thrown Error itself (not just its .message), so this can
// read `.status`. Every call site already has it in the catch block; the
// one-line change there is passing the error through instead of just
// `err.message`.
export default function ActionError({ error, fallback, className = 'project-board__card-error', id }) {
  if (!error) {
    return null;
  }

  const forbidden = error.status === 403;
  const message = error.message || fallback;

  return (
    <p id={id} className={forbidden ? `${className} ${className}--forbidden` : className} role="alert">
      {forbidden && (
        <svg
          className={`${className}__icon`}
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {message}
    </p>
  );
}
