import { useState } from 'react';

const columns = ['Product Backlog', 'Sprint Planning', 'Active Sprint', 'Completed'];

const taskHistory = [
  {
    sprint: 'Sprint 42 (Completed)',
    range: 'Sep 28 - Oct 11',
    tasks: [
      { title: 'Setup User Auth DB', by: '@John', logged: '12h' },
      { title: 'Design Landing Page', by: '@Jane', logged: '8h' }
    ]
  },
  {
    sprint: 'Sprint 41 (Completed)',
    range: 'Sep 14 - Sep 27',
    tasks: [{ title: 'Configure CI/CD Hooks', by: '@Adam', logged: '16h' }]
  }
];

// TODO: once dashboardController.js returns real board/history data, replace
// the mock arrays above with values read from the data prop
// NOTE: drag/drop and task card interaction belong to US-06/US-08 (board team), out of scope here
export default function DeveloperDashboard({ data }) {
  const [tab, setTab] = useState('history');

  return (
    <div className="developer-dashboard">
      <div className="developer-dashboard__board">
        <div className="developer-dashboard__header">
          <h1>Team Alpha Board</h1>
        </div>
        <div className="board-columns">
          {columns.map((column) => (
            <div className="board-column" key={column}>
              <h2>{column}</h2>
            </div>
          ))}
        </div>
      </div>

      <div className="developer-dashboard__sidebar">
        <h2>Team Alpha</h2>
        <div className="sidebar-tabs">
          <button
            className={tab === 'analytics' ? 'active' : ''}
            onClick={() => setTab('analytics')}
          >
            Analytics
          </button>
          <button
            className={tab === 'history' ? 'active' : ''}
            onClick={() => setTab('history')}
          >
            Task History
          </button>
        </div>

        {tab === 'history' && (
          <div className="task-history">
            {taskHistory.map((group) => (
              <div key={group.sprint}>
                <h3>{group.sprint}</h3>
                <p>{group.range}</p>
                <ul>
                  {group.tasks.map((task) => (
                    <li key={task.title}>
                      {task.title} — completed by {task.by}, logged {task.logged}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === 'analytics' && (
          <div className="analytics-tab">
            <p>Burndown chart and hours placeholder.</p>
          </div>
        )}
      </div>
    </div>
  );
}
