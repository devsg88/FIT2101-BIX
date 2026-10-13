import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { useAuth } from './AuthContext.jsx';
import {
  createTask,
  updateTask,
  createSubTask,
  updateSubTask,
  getBoard,
  movePbi,
  startSprint,
  updatePbiPlanning,
  updateTaskInPbi as apiUpdateTask,
  deleteTask as apiDeleteTask,
  updateSubTaskInTask as apiUpdateSubTask,
  deleteSubTask as apiDeleteSubTask,
  assignTask as apiAssignTask,
  assignSubTask as apiAssignSubTask,
  getProjectMembers,
  completeTask,
  completeSubTask,
  completePbi,
  updateProject,
  deleteProject as apiDeleteProject,
  updateWorkItemRoles
} from '../services/api.js';

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
  // US-04a / SCRUM-124. This project's members, for the assignee dropdown.
  // Loaded alongside the board (see loadBoard below) rather than lazily on
  // first dropdown render, so the dropdown never has to show its own
  // separate loading state - by the time the board is 'ready', the members
  // list is too. A failure here does not fail the whole board load (see
  // loadBoard's Promise.all handling below): the board is still usable
  // without assignee names, it would just be a worse dropdown.
  const [members, setMembers] = useState([]);

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
      return;
    }

    // Members are fetched after the board succeeds, and in their own
    // try/catch: this list only feeds the assignee dropdown (SCRUM-124), so
    // a failure here should not turn an otherwise-loadable board into an
    // error page. It just leaves `members` empty until the next reload.
    try {
      const { members: loadedMembers } = await getProjectMembers(projectId, token);
      setMembers(Array.isArray(loadedMembers) ? loadedMembers : []);
    } catch (err) {
      setMembers([]);
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
        const refreshError = new Error(`${savedMessage}: ${err.message}`);
        refreshError.saved = true;
        throw refreshError;
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

  // US-04a / SCRUM-121-123. Edit/delete a task or sub-task, then refresh from
  // the server - same "trust what got saved, not a local guess" pattern as
  // movePbiStage/savePbiPlanning above. Every one of these can reject with
  // the backend's 403 (non-admin), 409 (completed PBI, delete only), or 404;
  // the caller (ChecklistRow in Board.jsx) shows whatever message comes back.
  const editTask = useCallback(
    async (pbiId, taskId, payload) => {
      await apiUpdateTask(projectId, pbiId, taskId, payload, token);
      await refreshBoardAfterSave(
        'The task was saved, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const deleteTask = useCallback(
    async (pbiId, taskId) => {
      await apiDeleteTask(projectId, pbiId, taskId, token);
      await refreshBoardAfterSave(
        'The task was deleted, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const editSubTask = useCallback(
    async (pbiId, taskId, subTaskId, payload) => {
      await apiUpdateSubTask(projectId, pbiId, taskId, subTaskId, payload, token);
      await refreshBoardAfterSave(
        'The sub-task was saved, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const deleteSubTask = useCallback(
    async (pbiId, taskId, subTaskId) => {
      await apiDeleteSubTask(projectId, pbiId, taskId, subTaskId, token);
      await refreshBoardAfterSave(
        'The sub-task was deleted, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  // US-04a / SCRUM-122/124. Same refresh-after-save pattern as edit/delete
  // above. assigneeId may be null (unassign); the dropdown (Board.jsx) is
  // what turns "" back into null before calling this.
  const assignTask = useCallback(
    async (pbiId, taskId, assigneeId) => {
      await apiAssignTask(projectId, pbiId, taskId, assigneeId, token);
      await refreshBoardAfterSave(
        'The assignment was saved, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const assignSubTask = useCallback(
    async (pbiId, taskId, subTaskId, assigneeId) => {
      await apiAssignSubTask(projectId, pbiId, taskId, subTaskId, assigneeId, token);
      await refreshBoardAfterSave(
        'The assignment was saved, but the board could not be refreshed'
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

  // US-11 — Yichi Zhang. Complete a task with actual hours, a sub-task, or
  // the parent PBI (which moves it into Completed after hours/collaborators).
  const completeAssignedTask = useCallback(
    async (taskId, actualHours) => {
      await completeTask(projectId, taskId, actualHours, token);
      await refreshBoardAfterSave(
        'The task was completed, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const completeAssignedSubTask = useCallback(
    async (subTaskId) => {
      await completeSubTask(projectId, subTaskId, token);
      await refreshBoardAfterSave(
        'The sub-task was completed, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const completeActivePbi = useCallback(
    async (pbiId, payload) => {
      await completePbi(projectId, pbiId, payload, token);
      await refreshBoardAfterSave(
        'The item was completed, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const saveTask = useCallback(
    async (pbiId, taskId, fields) => {
      if (taskId == null) await createTask(projectId, pbiId, fields, token);
      else await updateTask(projectId, taskId, fields, token);
      await refreshBoardAfterSave('The task was saved, but the board could not be refreshed');
    },
    [projectId, token, refreshBoardAfterSave]
  );

  // US-04c. Renames the project (its board), then shows the name the server
  // actually saved, the same refresh-after-save pattern as the actions above.
  const renameProject = useCallback(
    async (name) => {
      await updateProject(projectId, name, token);
      await refreshBoardAfterSave(
        'The project was renamed, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  const saveSubTask = useCallback(
    async (taskId, subTaskId, fields) => {
      if (subTaskId == null) await createSubTask(projectId, taskId, fields, token);
      else await updateSubTask(projectId, subTaskId, fields, token);
      await refreshBoardAfterSave('The sub-task was saved, but the board could not be refreshed');
    },
    [projectId, token, refreshBoardAfterSave]
  );
  // US-09 / SCRUM-178. Saves a sprint's Scrum Master and Product Owner, then
  // refreshes so every card shows what was saved. Rejects with the server's
  // message (e.g. the 400 for a Scrum Master who is not a real user).
  const saveSprintRoles = useCallback(
    async (sprintId, scrumMasterId, productOwner) => {
      await updateWorkItemRoles(projectId, sprintId, scrumMasterId, productOwner, token);
      await refreshBoardAfterSave(
        'The sprint roles were saved, but the board could not be refreshed'
      );
    },
    [projectId, token, refreshBoardAfterSave]
  );

  // US-04c. Deletes the project (its board) - the backend only allows it while
  // the board has no PBIs or sprints. No refresh afterwards: on success the
  // page navigates away, and on failure the board is unchanged.
  const deleteCurrentProject = useCallback(async () => {
    await apiDeleteProject(projectId, token);
  }, [projectId, token]);

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
      members,
      stages: STAGES,
      status,
      error,
      reloadBoard: loadBoard,
      movePbiStage,
      savePbiPlanning,
      startPlannedSprint,
      editTask,
      deleteTask,
      editSubTask,
      deleteSubTask,
      assignTask,
      assignSubTask,
      completeAssignedTask,
      completeAssignedSubTask,
      completeActivePbi,
      saveTask,
      saveSubTask,
      renameProject,
      deleteCurrentProject,
      saveSprintRoles
    }),
    [
      projectId,
      project,
      pbis,
      pbisByStage,
      sprints,
      members,
      status,
      error,
      loadBoard,
      movePbiStage,
      savePbiPlanning,
      startPlannedSprint,
      editTask,
      deleteTask,
      editSubTask,
      deleteSubTask,
      assignTask,
      assignSubTask,
      completeAssignedTask,
      completeAssignedSubTask,
      completeActivePbi,
      saveTask,
      saveSubTask,
      renameProject,
      deleteCurrentProject,
      saveSprintRoles
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
