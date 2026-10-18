import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AccessDenied from '../components/common/AccessDenied.jsx';

// allowedRoles is optional. Omit it for "any authenticated user" (the
// original behaviour, unchanged). Pass e.g. allowedRoles={['admin']} to
// also require a specific role for this route.
//
// A logged-out user still goes to /login as before - they have no session
// at all, which is a different situation from being logged in but not
// permitted here. A logged-in user whose role isn't in allowedRoles stays
// on this URL and sees AccessDenied (NFR-01) instead of being silently
// bounced to /dashboard, so they get a reason rather than an unexplained
// redirect; AccessDenied's own "Back to Dashboard" link is how they leave.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <AccessDenied />;
  }

  return children;
}
