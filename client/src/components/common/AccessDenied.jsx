import { Link } from 'react-router-dom';

// NFR-01: shown in place of a page's content whenever the backend has
// already refused access with a 403 (wrong role, or a Developer not on this
// project's member list), or the frontend's own route guard already knows a
// role is not allowed on this page (see ProtectedRoute.jsx). This page never
// decides access itself - it only reflects a decision already made - so it
// carries no project data and no reason more specific than the generic
// message below, which matches the backend's own "do not reveal protected
// project information" rule for a denied request.
export default function AccessDenied() {
  return (
    <div className="access-denied" role="alert">
      <svg
        className="access-denied__icon"
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.8" />
      </svg>

      <h1 className="access-denied__title">Access Denied</h1>

      <p className="access-denied__message">
        You don&apos;t have permission to view this page or perform this action.
      </p>

      <Link to="/dashboard" className="access-denied__back">
        Back to Dashboard
      </Link>

      <p className="access-denied__contact">
        If you believe you should have access, contact your project administrator.
      </p>
    </div>
  );
}
