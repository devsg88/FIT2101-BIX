import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/api.js';
import AdminDashboard from '../components/dashboard/AdminDashboard.jsx';
import DeveloperDashboard from '../components/dashboard/DeveloperDashboard.jsx';
import AccessDenied from '../components/common/AccessDenied.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error' | 'forbidden'
  // NFR-03: bumped by Retry to run the load again. (Refreshing the browser
  // is not a safe suggestion - the login is held in memory, so a reload
  // signs the user out.)
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let isMounted = true;

    setStatus('loading');
    getDashboard(user.token)
      .then((data) => {
        if (!isMounted) return;
        setDashboardData(data);
        setStatus('ready');
      })
      .catch((err) => {
        if (!isMounted) return;
        // A 403 is an access decision, not a passing failure: no Retry.
        setStatus(err?.status === 403 ? 'forbidden' : 'error');
      });

    return () => {
      isMounted = false;
    };
  }, [user.token, loadAttempt]);

  if (status === 'loading') {
    return <p className="dashboard-status">Loading your dashboard...</p>;
  }

  if (status === 'forbidden') {
    return <AccessDenied />;
  }

  if (status === 'error') {
    return (
      <div className="dashboard-status" role="alert">
        <p>Couldn&apos;t load your dashboard.</p>
        <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
          Retry
        </button>
      </div>
    );
  }

  if (user.role === 'admin') {
    return <AdminDashboard data={dashboardData} />;
  }

  return <DeveloperDashboard data={dashboardData} />;
}
