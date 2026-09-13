import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useAuth } from './AuthContext.jsx';
import { getBoard, movePbi, startSprint, updatePbiPlanning } from '../services/api.js';

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

  // Applies a board API response to state. The one place `project`/`pbis`/
  // `sprints` are ever set from server data, used both for the first load
  // and for refreshing after a move / planning save / start sprint, so every
  // path trusts the data the same way.
  const applyBoardData = useCallback((data) => {
    setProject(data.project ?? null);
    setPbis(Array.isArray(data.pbis) ? data.pbis : []);
    setSprints(Array.isArray(data.sprints) ? data.sprints : []);
  }, []);

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
      applyBoardData(data);
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [projectId, token, applyBoardData]);

  // Load the board once when this component mounts (or if projectId/token change).
  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Moves one PBI to a new stage, then re-fetches the whole board rather than
  // guessing what changed locally.
  //
  // The freshly loaded board is the one true record of what the server
  // actually saved: it is what shows the moved PBI in its new stage, it is
  // what proves every other PBI is still where it should be, and it does not
  // rely on any assumption about which fields a move is allowed to touch.
  // This deliberately replaced an earlier version that patched just the
  // moved PBI's `stage` in local state from the move response alone, that
  // was a reasonable optimisation but it meant the board could show a
  // temporary, locally-guessed state rather than what was actually saved.
  //
  // This does not flip the whole page into its "Loading board..." state,
  // the board already on screen is still valid data (just possibly one move
  // behind), so it stays visible until the fresh copy is ready to replace it.
  //
  // Throws on failure so the caller (the move button) can show its own
  // error; this does not touch the whole-board `status`/`error` state, a
  // failed move or a failed refresh is a different kind of problem than a
  // failed initial load.
  const movePbiStage = useCallback(
    async (pbiId, targetStage) => {
      await movePbi(projectId, pbiId, targetStage, token);

      try {
        const data = await getBoard(projectId, token);
        applyBoardData(data);
      } catch (err) {
        // The move itself succeeded, only the refresh afterward failed, say
        // so rather than letting this read as "the move failed".
        throw new Error(
          `The move was saved, but the board could not be refreshed: ${err.message}`
        );
      }
    },
    [projectId, token, applyBoardData]
  );

  const refreshBoardAfterSave = useCallback(
    async (savedMessage) => {
      try {
        const data = await getBoard(projectId, token);
        applyBoardData(data);
      } catch (err) {
        throw new Error(`${savedMessage}: ${err.message}`);
      }
    },
    [projectId, token, applyBoardData]
  );

  // US-08b — Yichi Zhang. Same refresh-after-save pattern as movePbiStage:
  // the board on screen is replaced with what the server actually stored,
  // not a locally patched copy of the three planning fields.
  const savePbiPlanning = useCallback(
    async (pbiId, planning) => {
      await updatePbiPlanning(projectId, pbiId, planning, token);
      await refreshBoardAfterSave(
        'The planning details were saved, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  // US-10 — Yichi Zhang. After a successful start, every former Sprint
  // Planning card should reappear under Active Sprint from the fresh GET.
  const startPlannedSprint = useCallback(
    async (sprintId) => {
      await startSprint(projectId, sprintId, token);
      await refreshBoardAfterSave(
        'The sprint was started, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

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
      reloadBoard: loadBoard,
      movePbiStage,
      savePbiPlanning,
      startPlannedSprint
    }),
    [
      projectId,
      project,
      pbis,
      pbisByStage,
      sprints,
      status,
      error,
      loadBoard,
      movePbiStage,
      savePbiPlanning,
      startPlannedSprint
    ]
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
