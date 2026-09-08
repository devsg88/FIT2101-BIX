const teamTabs = ['Team Alpha', 'Team Delta', 'Team Foxtrot'];

const teams = [
  'Team Alpha',
  'Team Bravo',
  'Team Charlie',
  'Team Delta',
  'Team Echo',
  'Team Foxtrot',
  'Team Golf'
];

const tags = ['Front-end', 'Back-end', 'Design', 'QA', 'Infra'];

const columns = [
  {
    title: 'Rewrite onboarding copy',
    tag: 'Front-end',
    stage: 'Backlog',
    count: '0 of 3',
    tone: 'dark',
    tasks: [
      'Draft welcome screen text',
      'Review with design',
      'Hand off to build'
    ]
  },
  {
    title: 'Migrate session store',
    tag: 'Back-end',
    stage: 'Assigned',
    count: '1 of 4',
    tone: 'light',
    tasks: [
      'Benchmark current store',
      'Write migration script',
      'Dry run on staging',
      'Cut over'
    ]
  },
  {
    title: 'Tab bar shortcuts',
    tag: 'Front-end',
    stage: 'In progress',
    count: '2 of 3',
    tone: 'dark',
    tasks: [
      'Map key bindings',
      'Handle tab focus order',
      'Reopen closed tab'
    ]
  },
  {
    title: 'Dark theme tokens',
    tag: 'Design',
    stage: 'Testing',
    count: '3 of 4',
    tone: 'light',
    tasks: [
      'Pick dark surface ramp',
      'Re-test orange accent',
      'Contrast check',
      'Sign-off'
    ]
  },
  {
    title: 'Role permission checks',
    tag: 'Back-end',
    stage: 'Complete',
    count: '3 of 3',
    tone: 'dark',
    tasks: [
      'Define role matrix',
      'Gate admin actions',
      'Test as non-admin'
    ]
  },
  {
    title: 'Board scroll performance',
    tag: 'Front-end',
    stage: 'Assigned',
    count: '0 of 2',
    tone: 'light',
    tasks: [
      'Profile long boards',
      'Virtualise columns'
    ]
  }
];

const recentlyClosed = [
  { name: 'Team Golf', time: 'closed 2m ago' },
  { name: 'Team Echo', time: 'closed 14m ago' },
  { name: 'Team Bravo', time: 'closed 1h ago' }
];

export default function AdminDashboard({ data }) {
  return (
    <div className="admin-dashboard admin-board">
      <div className="admin-team-tabs">
        {teamTabs.map((team, index) => (
          <button
            type="button"
            className={`admin-team-tab ${
              index === 0 ? 'admin-team-tab--active' : ''
            }`}
            key={team}
          >
            <span className="admin-team-tab__dot" />
            <span>{team}</span>
            <span className="admin-team-tab__close">×</span>
          </button>
        ))}
      </div>

      <div className="admin-board__workspace">
        <aside className="admin-board__sidebar">
          <div className="admin-board__sidebar-icon">▣</div>

          <div className="admin-search">
            <span className="admin-search__icon">⌕</span>
            <input type="text" placeholder="Search tasks" />
          </div>

          <p className="admin-sidebar-label">TEAMS</p>

          <div className="admin-team-list">
            {teams.map((team) => (
              <button type="button" key={team}>
                {team}
              </button>
            ))}
          </div>

          <div className="admin-sidebar-divider" />

          <p className="admin-sidebar-label">TAGS</p>

          <div className="admin-tag-list">
            {tags.map((tag) => (
              <span
                className={`admin-tag admin-tag--${tag
                  .toLowerCase()
                  .replace('-', '')}`}
                key={tag}
              >
                {tag}
              </span>
            ))}
          </div>
        </aside>

        <main className="admin-board__columns">
          {columns.map((column, columnIndex) => (
            <section
              className={`admin-work-column admin-work-column--${column.tone}`}
              key={column.title}
            >
              <div className="admin-work-column__top-card">
                <h2>{column.title}</h2>
                <span>{column.tag}</span>
              </div>

              <div className="admin-progress-strip" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={
                      step < columnIndex
                        ? 'admin-progress-strip__step admin-progress-strip__step--filled'
                        : 'admin-progress-strip__step'
                    }
                  />
                ))}
              </div>

              <div className="admin-work-column__meta">
                <span>{column.stage}</span>
                <span>{column.count}</span>
              </div>

              <div className="admin-task-list">
                {column.tasks.map((task, taskIndex) => (
                  <div
                    className={`admin-task-card ${
                      taskIndex < columnIndex - 1
                        ? 'admin-task-card--completed'
                        : ''
                    }`}
                    key={task}
                  >
                    <span className="admin-task-checkbox" />
                    <span>{task}</span>
                  </div>
                ))}

                <button type="button" className="admin-add-step">
                  <span>＋</span>
                  Add step
                </button>
              </div>

              <button type="button" className="admin-delete-task">
                Delete task
              </button>
            </section>
          ))}
        </main>

        <aside className="admin-recent">
          <div className="admin-recent__icon">↶</div>

          <div className="admin-recent__list">
            {recentlyClosed.map((team) => (
              <div className="admin-recent-card" key={team.name}>
                <strong>{team.name}</strong>
                <span>{team.time}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}