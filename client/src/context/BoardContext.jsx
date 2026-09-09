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

// The four workflow stages (US-06), in fixed order. Matches BOARD_STAGES on the
// backend (server/src/controllers/boardController.js).
export const STAGES = [
  'product_backlog',
  'sprint_planning',
  'active_sprint',
  'completed'
];

export const STAGE_LABELS = {
  product_backlog: 'Product Backlog',
  sprint_planning: 'Sprint Planning',
  active_sprint: 'Active Sprint',
  completed: 'Completed'
};

const BoardContext = createContext(null);

export function BoardProvider({ projectId, children }) {
  const { user } = useAuth();
  const token = user?.token;

  const [project, setProject] = useState(null);
  const [pbis, setPbis] = useState([]); // single source of truth for PBIs
  const [sprints, setSprints] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);

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

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Per-column lists are derived from the single `pbis` array, never stored
  // separately, so there is only one place a PBI's stage can be wrong.
  const pbisByStage = useMemo(() => {
    const grouped = Object.fromEntries(STAGES.map((stage) => [stage, []]));
    for (const pbi of pbis) {
      if (grouped[pbi.stage]) {
        grouped[pbi.stage].push(pbi);
      }
    }
    return grouped;
  }, [pbis]);

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

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) {
    throw new Error('useBoard must be used within a BoardProvider');
  }
  return ctx;
}
