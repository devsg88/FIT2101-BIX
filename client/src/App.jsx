import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import MyProjects from './pages/MyProjects.jsx';
import Board from './pages/Board.jsx';
import TeamDetail from './pages/TeamDetail.jsx';
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
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <MyProjects />
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-projects"
        element={
          <ProtectedRoute>
            <MyProjects />
          </ProtectedRoute>
        }
      />
      {/* Project board (Journey 3). Same login check as the other pages. */}
      <Route
        path="/projects/:projectId/board"
        element={
          <ProtectedRoute>
            <Board />
          </ProtectedRoute>
        }
      />
      {/* Admin: one team's page, reached from the sidebar or the Team Health
          table on the Organization Overview (AdminDashboard.jsx). */}
      <Route
        path="/teams/:teamId"
        element={
          <ProtectedRoute>
            <TeamDetail />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
