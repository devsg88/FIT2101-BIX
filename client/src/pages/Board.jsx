import { useParams } from 'react-router-dom';
import {
  BoardProvider,
  useBoard,
  STAGE_LABELS
} from '../context/BoardContext.jsx';

// One PBI card shown inside a column.
function PbiCard({ pbi }) {
  const taskCount = pbi.tasks?.length ?? 0;

  return (
    <article className="project-board__card">
      <h3 className="project-board__card-title">{pbi.title}</h3>
      {pbi.description && (
        <p className="project-board__card-description">{pbi.description}</p>
      )}
      <p className="project-board__card-meta">
        {pbi.estimated_hours != null && (
          <span>Est: {pbi.estimated_hours}h</span>
        )}
        {taskCount > 0 && <span>{taskCount} task{taskCount === 1 ? '' : 's'}</span>}
      </p>
    </article>
  );
}

// The four columns, one per stage, each showing its own PBIs (or an empty message).
function BoardColumns() {
  const { stages, pbisByStage } = useBoard();

  return (
    <div className="project-board__columns">
      {stages.map((stage) => (
        <section className="project-board__column" key={stage}>
          <h2 className="project-board__column-title">{STAGE_LABELS[stage]}</h2>
          {pbisByStage[stage].length === 0 ? (
            <p className="project-board__empty">No items</p>
          ) : (
            pbisByStage[stage].map((pbi) => <PbiCard key={pbi.id} pbi={pbi} />)
          )}
        </section>
      ))}
    </div>
  );
}

// Picks what to show based on the board's current status: loading, error, or ready.
function BoardView() {
  const { status, error, project, reloadBoard } = useBoard();

  if (status === 'loading') {
    return <p className="project-board__status">Loading board...</p>;
  }

  if (status === 'error') {
    return (
      <div className="project-board__status" role="alert">
        <p>Couldn&apos;t load the board{error ? `: ${error}` : ''}.</p>
        <button type="button" onClick={reloadBoard}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="project-board">
      <header className="project-board__header">
        <h1>{project?.name ?? 'Project board'}</h1>
      </header>
      <BoardColumns />
    </div>
  );
}

// Page entry point. Reads the projectId straight from the URL, so this page
// never has to hard-code which project it is showing.
export default function Board() {
  const { projectId } = useParams();

  return (
    <BoardProvider projectId={projectId}>
      <BoardView />
    </BoardProvider>
  );
}
