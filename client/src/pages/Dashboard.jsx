import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/api.js';
import AdminDashboard from '../components/dashboard/AdminDashboard.jsx';
import DeveloperDashboard from '../components/dashboard/DeveloperDashboard.jsx';

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
    return <AdminDashboard data={dashboardData} />;
  }

  return <DeveloperDashboard data={dashboardData} />;
}
