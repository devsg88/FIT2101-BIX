import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useAuth } from './AuthContext.jsx';
import { getBoard } from '../services/api.js';

// The four workflow stages from US-06, always in this order. This should
// match BOARD_STAGES on the backend (server/src/controllers/boardController.js).
export const STAGES = [
  'product_backlog',
  'sprint_planning',
  'active_sprint',
  'completed'
];

// Turns each stage's machine name into the text shown on screen.
export const STAGE_LABELS = {
  product_backlog: 'Product Backlog',
  sprint_planning: 'Sprint Planning',
  active_sprint: 'Active Sprint',
  completed: 'Completed'
};

const BoardContext = createContext(null);

// Loads and holds the state for one project's board, and shares it with any
// component inside it through useBoard().
export function BoardProvider({ projectId, children }) {
  const { user } = useAuth();
  const token = user?.token;

  const [project, setProject] = useState(null);
  const [pbis, setPbis] = useState([]); // the one and only list of PBIs
  const [sprints, setSprints] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);

  // Fetches the board from the API and updates all the state above.
  // Also used as the "retry" action when loading fails.
  const loadBoard = useCallback(async () => {
    if (!projectId || !token) {
      return;
    }

    setStatus('loading');
    setError(null);

    try {
      const data = await getBoard(projectId, token);
      setProject(data.project ?? null);
      setPbis(Array.isArray(data.pbis) ? data.pbis : []);
      setSprints(Array.isArray(data.sprints) ? data.sprints : []);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [projectId, token]);

  // Load the board once when this component mounts (or if projectId/token change).
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // We only keep one list of PBIs. The four columns are worked out from it
  // here, instead of being stored separately, so a PBI's stage can never
  // disagree with which column it shows up in.
  const pbisByStage = useMemo(() => {
    const grouped = Object.fromEntries(STAGES.map((stage) => [stage, []]));
    for (const pbi of pbis) {
      if (grouped[pbi.stage]) {
        grouped[pbi.stage].push(pbi);
      }
    }
    return grouped;
  }, [pbis]);

  // Everything a board component might need, bundled together.
  const value = useMemo(
    () => ({
      projectId,
      project,
      pbis,
      pbisByStage,
      sprints,
      stages: STAGES,
      status,
      error,
      reloadBoard: loadBoard
    }),
    [projectId, project, pbis, pbisByStage, sprints, status, error, loadBoard]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

// Lets any component read the board state without passing props down
// through every level. Must be used inside a BoardProvider.
export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) {
    throw new Error('useBoard must be used within a BoardProvider');
  }
  return ctx;
}
