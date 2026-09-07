import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} replace />} />
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
