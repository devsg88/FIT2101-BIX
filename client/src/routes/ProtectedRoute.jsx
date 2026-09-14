import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// allowedRoles is optional. Omit it for "any authenticated user" (the
// original behaviour, unchanged). Pass e.g. allowedRoles={['admin']} to
// also require a specific role for this route.
//
// A logged-out user still goes to /login as before. A logged-in user whose
// role isn't in allowedRoles goes to /dashboard instead, not /login - they
// do have a valid session, they're just not allowed on this particular
// page, which is a different situation from not being authenticated at all.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
