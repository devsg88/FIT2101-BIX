import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/api.js';
import AdminDashboard from '../components/dashboard/AdminDashboard.jsx';
import DeveloperDashboard from '../components/dashboard/DeveloperDashboard.jsx';

// TEMPORARY: there is no project picker anywhere yet, so this just points at
// the seeded project (id 1, "BIX Platform"). It exists purely so the board
// page can be reached by clicking a link (a normal same-page navigation)
// instead of typing the URL directly, which forces a full page reload and
// loses the signed-in session (AuthContext keeps it in memory only, it is
// not persisted). Remove this once there is a real way to get to a project's
// board (a project list, a link from search, etc).
function DevBoardLink() {
  return (
    <p className="dev-board-link">
      <Link to="/projects/1/board">Open the BIX Platform board (dev link)</Link>
    </p>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'

  useEffect(() => {
    let isMounted = true;

    setStatus('loading');
    getDashboard(user.token)
      .then((data) => {
        if (!isMounted) return;
        setDashboardData(data);
        setStatus('ready');
      })
      .catch(() => {
        if (!isMounted) return;
        setStatus('error');
      });

    return () => {
      isMounted = false;
    };
  }, [user.token]);

  if (status === 'loading') {
    return <p className="dashboard-status">Loading your dashboard...</p>;
  }

  if (status === 'error') {
    return (
      <p className="dashboard-status" role="alert">
        Couldn't load your dashboard. Try refreshing.
      </p>
    );
  }

  if (user.role === 'admin') {
    return (
      <>
        <DevBoardLink />
        <AdminDashboard data={dashboardData} />
      </>
    );
  }

  return (
    <>
      <DevBoardLink />
      <DeveloperDashboard data={dashboardData} />
    </>
  );
}
