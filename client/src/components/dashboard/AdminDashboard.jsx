const stats = [
  { label: 'Active Sprint Teams', value: '18 / 24 total teams' },
  { label: 'Tasks in Progress', value: '142 across all boards' },
  { label: 'Teams Blocked / At Risk', value: '2 require admin attention' }
];

const teams = [
  { name: 'Team Alpha', owner: '@John', project: 'Auth Module Upgrade', progress: 70, status: 'On Track' },
  { name: 'Team Bravo', owner: '@Jane', project: 'Database Migration', progress: 25, status: 'Blocked' },
  { name: 'Team Charlie', owner: '@Adam', project: 'Frontend Dashboard', progress: 90, status: 'On Track' }
];

// TODO (US-02 commit 4/5): replace mock stats/teams with real GET /api/dashboard data
export default function AdminDashboard() {
  return (
    <div className="admin-dashboard">
      <div className="admin-dashboard__header">
        <h1>Organization Overview</h1>
      </div>

      <div className="admin-dashboard__stats">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <p className="stat-card__label">{stat.label.toUpperCase()}</p>
            <p className="stat-card__value">{stat.value}</p>
          </div>
        ))}
      </div>

      <table className="team-health-table">
        <thead>
          <tr>
            <th>Team Name</th>
            <th>Product Owner</th>
            <th>Current Project</th>
            <th>Sprint Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.name}>
              <td>{team.name}</td>
              <td>{team.owner}</td>
              <td>{team.project}</td>
              <td>{team.progress}%</td>
              <td>{team.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
