import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import {
  getBoard,
  movePbi,
  updatePbiPlanning,
  startSprint,
  updateTaskInPbi as updateTask,
  deleteTask,
  updateSubTaskInTask as updateSubTask,
  deleteSubTask,
  assignTask,
  assignSubTask,
  getProjectMembers
} from '../services/api.js';

// US-04a / SCRUM-123-124: the admin-only Edit/Delete/assignee controls on
// Board.jsx's task and sub-task checklist rows. Kept in a separate file
// from Board.test.jsx (which stays focused on the developer-role,
// read-only board and the existing US-06/US-08a/US-08b/US-10 flows) rather
// than growing that already-large file further - same reason a new
// resource gets its own model/controller/route file on the backend.
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

function renderBoard(path = '/projects/7/board') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<Board />} />
      </Routes>
    </MemoryRouter>
  );
}

const members = [
  { id: 1, name: 'Pang', email: 'pang@bix.app', role: 'developer' },
  { id: 2, name: 'Developer', email: 'developer@bix.app', role: 'developer' }
];

const boardWithOneTask = {
  project: { id: 7, name: 'BIX Platform' },
  sprints: [],
  pbis: [
    {
      id: 2,
      title: 'Upload photo',
      stage: 'sprint_planning',
      tasks: [
        {
          id: 9,
          title: 'Build upload endpoint',
          status: 'todo',
          assignee_id: null,
          subTasks: [
            { id: 20, title: 'Validate file type', status: 'todo', assignee_id: null }
          ]
        }
      ]
    }
  ]
};

describe('Board page - admin task/sub-task controls (US-04a)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProjectMembers.mockResolvedValue({ members });
  });

  it('shows no Edit/Delete/assignee controls for a non-admin (developer)', async () => {
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'tok' } });
    getBoard.mockResolvedValue(boardWithOneTask);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    // BoardContext fetches the member list alongside the board regardless
    // of role (see loadBoard in BoardContext.jsx) - it's the *display* that
    // is admin-only, not the fetch. A developer's board still calls this,
    // it just never renders anything that uses the result.
    expect(getProjectMembers).toHaveBeenCalledWith('7', 'tok');
  });

  it('shows Edit/Delete/assignee controls for both a task and its sub-task, for an admin', async () => {
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
    getBoard.mockResolvedValue(boardWithOneTask);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());
    await waitFor(() => expect(getProjectMembers).toHaveBeenCalledWith('7', 'admin-tok'));

    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    expect(screen.getByLabelText('Assignee for Build upload endpoint')).toBeInTheDocument();
    expect(screen.getByLabelText('Assignee for Validate file type')).toBeInTheDocument();
  });

  it('edits a task through the inline form and refreshes from the server', async () => {
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
    getBoard
      .mockResolvedValueOnce(boardWithOneTask)
      .mockResolvedValueOnce({
        ...boardWithOneTask,
        pbis: [{
          ...boardWithOneTask.pbis[0],
          tasks: [{ ...boardWithOneTask.pbis[0].tasks[0], title: 'Build upload endpoint (v2)', status: 'in_progress' }]
        }]
      });
    updateTask.mockResolvedValue({ task: { id: 9 } });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    const titleInput = screen.getByLabelText('Title');
    expect(titleInput).toHaveValue('Build upload endpoint');
    fireEvent.change(titleInput, { target: { value: 'Build upload endpoint (v2)' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'in_progress' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateTask).toHaveBeenCalledWith(
      '7',
      2,
      9,
      { title: 'Build upload endpoint (v2)', status: 'in_progress' },
      'admin-tok'
    );

    await waitFor(() =>
      expect(screen.getByText('Build upload endpoint (v2)')).toBeInTheDocument()
    );
    // The edit form closed - back to the read-only row.
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
  });

  it('cancels an edit without saving or calling the API', async () => {
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
    getBoard.mockResolvedValue(boardWithOneTask);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Something else entirely' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(updateTask).not.toHaveBeenCalled();
    expect(screen.getByText('Build upload endpoint')).toBeInTheDocument();
  });

  // Completing work is the US-11 Complete action, not Edit.
  it('does not offer Done in the status menu for an open item', async () => {
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
    getBoard.mockResolvedValue(boardWithOneTask);

    renderBoard();

    await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    const statusSelect = screen.getByLabelText('Status');
    const options = Array.from(statusSelect.options).map((option) => option.value);
    expect(options).toEqual(['todo', 'in_progress']);
    expect(statusSelect).toBeEnabled();
  });

  it('locks a done item\'s status at Done but still lets its title be edited', async () => {
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
    const doneTask = { ...boardWithOneTask.pbis[0].tasks[0], status: 'done' };
    const boardWithDoneTask = {
      ...boardWithOneTask,
      pbis: [{ ...boardWithOneTask.pbis[0], tasks: [doneTask] }]
    };
    getBoard.mockResolvedValue(boardWithDoneTask);
    updateTask.mockResolvedValue({ task: { ...doneTask, title: 'Build upload endpoint (typo fixed)' } });

    renderBoard();

    await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);

    const statusSelect = screen.getByLabelText('Status');
    expect(Array.from(statusSelect.options).map((option) => option.value)).toEqual(['done']);
    expect(statusSelect).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Build upload endpoint (typo fixed)' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateTask).toHaveBeenCalledWith(
        '7',
        2,
        9,
        { title: 'Build upload endpoint (typo fixed)', status: 'done' },
        'admin-tok'
      )
    );
  });

  it('shows the edit form\'s own error and stays open when the save is rejected', async () => {
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
    getBoard.mockResolvedValue(boardWithOneTask);
    updateTask.mockRejectedValue(new Error('You do not have permission to perform this action'));

    renderBoard();

    await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'You do not have permission to perform this action'
      )
    );
    // Still editable - the form did not silently close on failure.
    expect(screen.getByLabelText('Title')).toBeInTheDocument();
  });

  describe('delete', () => {
    let confirmSpy;

    beforeEach(() => {
      confirmSpy = vi.spyOn(window, 'confirm');
    });

    afterEach(() => {
      confirmSpy.mockRestore();
    });

    it('deletes a task after the user confirms, then shows the refreshed board', async () => {
      confirmSpy.mockReturnValue(true);
      useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
      getBoard
        .mockResolvedValueOnce(boardWithOneTask)
        .mockResolvedValueOnce({
          ...boardWithOneTask,
          pbis: [{ ...boardWithOneTask.pbis[0], tasks: [] }]
        });
      deleteTask.mockResolvedValue({ message: 'Task deleted', id: 9 });

      renderBoard();

      await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

      expect(confirmSpy).toHaveBeenCalled();
      expect(deleteTask).toHaveBeenCalledWith('7', 2, 9, 'admin-tok');

      await waitFor(() =>
        expect(screen.queryByText('Build upload endpoint')).not.toBeInTheDocument()
      );
    });

    it('does nothing when the user cancels the confirm dialog', async () => {
      confirmSpy.mockReturnValue(false);
      useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
      getBoard.mockResolvedValue(boardWithOneTask);

      renderBoard();

      await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

      expect(deleteTask).not.toHaveBeenCalled();
      expect(screen.getByText('Build upload endpoint')).toBeInTheDocument();
    });

    it('shows an error and re-enables Delete when the backend rejects (e.g. a completed PBI)', async () => {
      confirmSpy.mockReturnValue(true);
      useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
      getBoard.mockResolvedValue(boardWithOneTask);
      deleteTask.mockRejectedValue(new Error('Cannot delete work items on a completed PBI'));

      renderBoard();

      await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());

      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'Cannot delete work items on a completed PBI'
        )
      );
      expect(screen.getByText('Build upload endpoint')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Delete' })[0]).not.toBeDisabled();
    });

    it('deletes a sub-task using its own id plus its parent task id', async () => {
      confirmSpy.mockReturnValue(true);
      useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
      getBoard.mockResolvedValue(boardWithOneTask);
      deleteSubTask.mockResolvedValue({ message: 'Sub-task deleted', id: 20 });

      renderBoard();

      await waitFor(() => expect(screen.getByText('Validate file type')).toBeInTheDocument());

      // Index 1: the sub-task's Delete button (index 0 is the task's).
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1]);

      expect(deleteSubTask).toHaveBeenCalledWith('7', 2, 9, 20, 'admin-tok');
    });
  });

  describe('assignee dropdown', () => {
    it('assigns a task to a project member', async () => {
      useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
      getBoard
        .mockResolvedValueOnce(boardWithOneTask)
        .mockResolvedValueOnce({
          ...boardWithOneTask,
          pbis: [{
            ...boardWithOneTask.pbis[0],
            tasks: [{ ...boardWithOneTask.pbis[0].tasks[0], assignee_id: 1 }]
          }]
        });
      assignTask.mockResolvedValue({ task: { id: 9, assignee_id: 1 } });

      renderBoard();

      await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());
      await waitFor(() => expect(getProjectMembers).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Assignee for Build upload endpoint'), {
        target: { value: '1' }
      });

      expect(assignTask).toHaveBeenCalledWith('7', 2, 9, 1, 'admin-tok');

      await waitFor(() =>
        expect(screen.getByLabelText('Assignee for Build upload endpoint')).toHaveValue('1')
      );
    });

    it('unassigns a sub-task by selecting "Unassigned" (empty value -> null)', async () => {
      useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
      const assignedBoard = {
        ...boardWithOneTask,
        pbis: [{
          ...boardWithOneTask.pbis[0],
          tasks: [{
            ...boardWithOneTask.pbis[0].tasks[0],
            subTasks: [{ ...boardWithOneTask.pbis[0].tasks[0].subTasks[0], assignee_id: 2 }]
          }]
        }]
      };
      getBoard.mockResolvedValueOnce(assignedBoard).mockResolvedValueOnce(boardWithOneTask);
      assignSubTask.mockResolvedValue({ subTask: { id: 20, assignee_id: null } });

      renderBoard();

      await waitFor(() => expect(screen.getByText('Validate file type')).toBeInTheDocument());
      await waitFor(() => expect(getProjectMembers).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Assignee for Validate file type'), {
        target: { value: '' }
      });

      expect(assignSubTask).toHaveBeenCalledWith('7', 2, 9, 20, null, 'admin-tok');
    });

    it('shows an error next to the dropdown when the assignment is rejected', async () => {
      useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'admin-tok' } });
      getBoard.mockResolvedValue(boardWithOneTask);
      assignTask.mockRejectedValue(new Error('assignee_id must be a member of this project'));

      renderBoard();

      await waitFor(() => expect(screen.getByText('Build upload endpoint')).toBeInTheDocument());
      await waitFor(() => expect(getProjectMembers).toHaveBeenCalled());

      fireEvent.change(screen.getByLabelText('Assignee for Build upload endpoint'), {
        target: { value: '1' }
      });

      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'assignee_id must be a member of this project'
        )
      );
    });
  });
});
