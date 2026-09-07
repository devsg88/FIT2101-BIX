import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { getDashboard } from '../services/api.js';
import AdminDashboard from '../components/dashboard/AdminDashboard.jsx';
import DeveloperDashboard from '../components/dashboard/DeveloperDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    // TODO (US-02 commit 8): handle loading/empty/error states properly
    getDashboard(user.token).then(setDashboardData).catch(() => {});
  }, [user.token]);

  if (user.role === 'admin') {
    return <AdminDashboard data={dashboardData} />;
  }

  return <DeveloperDashboard data={dashboardData} />;
}
