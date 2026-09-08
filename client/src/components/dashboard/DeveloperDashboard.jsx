const backlogTask = {
  title: 'Setup CI/CD Pipeline',
  status: 'Status: Unestimated'
};

const planningTask = {
  title: 'DB Schema Design',
  scrumMaster: '@John',
  productOwner: '@Jane',
  estimate: '8h',
  dates: 'Oct 20 - Oct 22',
  checklist: ['Draw ERD Diagram', 'Review with Backend']
};

const activeTask = {
  title: 'Auth Module API',
  scrumMaster: '@Jane',
  productOwner: '@John',
  estimate: '16h',
  dates: 'Oct 12 - Oct 19',
  checklist: [
    'JWT Token generation',
    'Route middleware checks',
    'Unit test coverage'
  ]
};

export default function DeveloperDashboard({ data }) {
  return (
    <div className="developer-dashboard developer-board">
      <header className="developer-dashboard__header developer-topbar">
        <div className="developer-topbar__left">
          <strong className="developer-topbar__logo">BIX</strong>

          <span className="developer-home" aria-hidden="true">
            ⌂
          </span>

          <span className="developer-board-pill">Team Alpha Board</span>
        </div>

        <div className="developer-topbar__user">
          <span>John</span>
          <span className="developer-avatar">J</span>
        </div>
      </header>

      <div className="developer-board__workspace">
        <main className="developer-dashboard__board developer-columns board-columns">

          <section className="developer-column board-column">
            <h2>Product Backlog</h2>

            <article className="developer-card developer-card--backlog">
              <h3>{backlogTask.title}</h3>
              <p>{backlogTask.status}</p>
            </article>
          </section>

          <section className="developer-column board-column">
            <h2>Sprint Planning</h2>

            <article className="developer-card developer-card--orange">
              <h3>{planningTask.title}</h3>

              <div className="developer-task-people">
                <strong>SM: {planningTask.scrumMaster}</strong>
                <strong>PO: {planningTask.productOwner}</strong>
              </div>

              <div className="developer-task-estimate">
                Est: {planningTask.estimate} | {planningTask.dates}
              </div>

              <ul className="developer-checklist">
                {planningTask.checklist.map((item) => (
                  <li key={item}>
                    <span className="developer-checkbox" />
                    {item}
                  </li>
                ))}
              </ul>

              <button type="button" className="developer-drag-button">
                Drag to Active Sprint →
              </button>
            </article>
          </section>

          <section className="developer-column board-column">
            <h2>Active Sprint</h2>

            <article className="developer-card developer-card--orange">
              <h3>{activeTask.title}</h3>

              <div className="developer-task-people">
                <strong>SM: {activeTask.scrumMaster}</strong>
                <strong>PO: {activeTask.productOwner}</strong>
              </div>

              <div className="developer-task-estimate">
                Est: {activeTask.estimate} | {activeTask.dates}
              </div>

              <ul className="developer-checklist">
                {activeTask.checklist.map((item) => (
                  <li key={item}>
                    <span className="developer-checkbox" />
                    {item}
                  </li>
                ))}
              </ul>

              <button type="button" className="developer-done-button">
                ✓ Log Hours &amp; Done
              </button>
            </article>
          </section>

          <section className="developer-column board-column">
            <h2>Completed</h2>
          </section>

        </main>

        <aside className="developer-dashboard__sidebar developer-analytics analytics-tab">
          <h2>Team Alpha Analytics</h2>

          <p className="developer-sprint-date">
            Active Sprint: Oct 12 - Oct 26
          </p>

          <div className="developer-chart-title">
            <strong>Burndown Chart</strong>

            <div className="developer-chart-legend">
              <span>
                <i className="legend-dot legend-dot--ideal" />
                Ideal
              </span>

              <span>
                <i className="legend-dot legend-dot--actual" />
                Actual
              </span>
            </div>
          </div>

          <div className="burndown-chart">
            <div className="chart-grid-line chart-grid-line--one" />
            <div className="chart-grid-line chart-grid-line--two" />
            <div className="chart-grid-line chart-grid-line--three" />

            <svg viewBox="0 0 300 150" preserveAspectRatio="none">
              <line
                className="burndown-ideal"
                x1="0"
                y1="130"
                x2="300"
                y2="18"
              />

              <polyline
                className="burndown-actual"
                points="0,130 75,100 150,58 225,47"
              />
            </svg>
          </div>

          <div className="developer-hours-heading">
            <strong>Hours: Est vs Completed</strong>

            <div className="developer-chart-legend">
              <span>
                <i className="legend-box legend-box--estimate" />
                Est
              </span>

              <span>
                <i className="legend-box legend-box--logged" />
                Log
              </span>
            </div>
          </div>

          <div className="hours-chart">
            <div className="hours-bars">

              <div className="hours-group">
                <div className="hours-bar hours-bar--estimate hours-bar--api-est" />
                <div className="hours-bar hours-bar--logged hours-bar--api-log" />
              </div>

              <div className="hours-group">
                <div className="hours-bar hours-bar--estimate hours-bar--ui-est" />
                <div className="hours-bar hours-bar--logged hours-bar--ui-log" />
              </div>

            </div>

            <div className="hours-labels">
              <span>Auth API</span>
              <span>UI Design</span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}