import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import * as api from '../services/api.js';

vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

const subTask = { id: '12', task_id: '11', title: 'Validate input', description: 'Check types', status: 'todo' };
const task = { id: '11', pbi_id: '10', title: 'Build API', description: 'API details', status: 'todo', subTasks: [subTask] };
const pbi = { id: '10', title: 'Upload photo', stage: 'sprint_planning', tasks: [task] };
const board = { project: { id: '7', name: 'BIX Platform' }, sprints: [], pbis: [pbi] };

function renderBoard() {
  return render(<MemoryRouter initialEntries={['/projects/7/board']}>
    <Routes><Route path="/projects/:projectId/board" element={<Board />} /></Routes>
  </MemoryRouter>);
}

describe('Sprint Planning breakdown', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuth.mockReturnValue({ user: { id: '2', name: 'Developer', role: 'developer', token: 'tok' } });
    api.getBoard.mockResolvedValue(board);
  });

  it.each([
    ['task', 'Upload photo', 'createTask', '10'],
    ['sub-task', 'Build API', 'createSubTask', '11']
  ])('creates a %s under its existing parent and shows server-confirmed data', async (kind, parent, method, parentId) => {
    const updated = kind === 'task'
      ? { ...pbi, tasks: [...pbi.tasks, { id: '14', pbi_id: pbi.id, title: 'New work', description: 'Details', subTasks: [] }] }
      : { ...pbi, tasks: [{ ...task, subTasks: [...task.subTasks, { id: '14', task_id: task.id, title: 'New work', description: 'Details' }] }] };
    api.getBoard.mockResolvedValueOnce(board).mockResolvedValue({ ...board, pbis: [updated] });
    api[method].mockResolvedValue({});
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: `Add ${kind} to ${parent}` }));
    fireEvent.change(screen.getByLabelText(`${kind} title: ${parent}`), { target: { value: '  New work  ' } });
    fireEvent.change(screen.getByLabelText(`${kind} description: ${parent}`), { target: { value: 'Details' } });
    fireEvent.click(screen.getByRole('button', { name: `Create ${kind}` }));
    await screen.findByText('New work');
    expect(api[method]).toHaveBeenCalledWith('7', parentId, { title: 'New work', description: 'Details' }, 'tok');
    expect(screen.getAllByRole('heading', { name: 'Upload photo' })).toHaveLength(1);
    expect(screen.queryByRole('form', { name: `New ${kind}: ${parent}` })).not.toBeInTheDocument();
  });

  it.each([
    ['task', 'Build API', 'updateTask', '11', 'API details'],
    ['sub-task', 'Validate input', 'updateSubTask', '12', 'Check types']
  ])('edits a %s and allows clearing its description', async (kind, name, method, id, description) => {
    api[method].mockResolvedValue({});
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: `Edit ${kind}: ${name}` }));
    expect(screen.getByLabelText(`${kind} title: ${name}`)).toHaveValue(name);
    expect(screen.getByLabelText(`${kind} description: ${name}`)).toHaveValue(description);
    fireEvent.change(screen.getByLabelText(`${kind} title: ${name}`), { target: { value: 'Updated work' } });
    fireEvent.change(screen.getByLabelText(`${kind} description: ${name}`), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: `Save ${kind}` }));
    await waitFor(() => expect(api[method]).toHaveBeenCalledWith('7', id, { title: 'Updated work', description: null }, 'tok'));
    await waitFor(() => expect(api.getBoard).toHaveBeenCalledTimes(2));
  });

  it('rejects whitespace-only titles locally', async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'Add task to Upload photo' }));
    fireEvent.change(screen.getByLabelText('task title: Upload photo'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A non-empty title is required');
    expect(api.createTask).not.toHaveBeenCalled();
  });

  it('cancels an edit without sending a request', async () => {
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit task: Build API' }));
    fireEvent.change(screen.getByLabelText('task title: Build API'), { target: { value: 'Discard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.updateTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit task: Build API' }));
    expect(screen.getByLabelText('task title: Build API')).toHaveValue('Build API');
  });

  it('preserves input on an API rejection and allows retry', async () => {
    api.createTask.mockRejectedValueOnce(new Error('You are not a member of this project')).mockResolvedValueOnce({});
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'Add task to Upload photo' }));
    fireEvent.change(screen.getByLabelText('task title: Upload photo'), { target: { value: 'Retry me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You are not a member');
    expect(screen.getByLabelText('task title: Upload photo')).toHaveValue('Retry me');
    expect(api.getBoard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    await waitFor(() => expect(api.createTask).toHaveBeenCalledTimes(2));
  });

  it('prevents duplicate submission while saving', async () => {
    let finish;
    api.createTask.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'Add task to Upload photo' }));
    fireEvent.change(screen.getByLabelText('task title: Upload photo'), { target: { value: 'Work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(api.createTask).toHaveBeenCalledOnce();
    finish({});
    await waitFor(() => expect(screen.queryByText('Saving...')).not.toBeInTheDocument());
  });

  it('offers refresh instead of creating a duplicate after a saved-but-unrefreshed request', async () => {
    api.createTask.mockResolvedValue({});
    api.getBoard.mockResolvedValueOnce(board).mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue(board);
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'Add task to Upload photo' }));
    fireEvent.change(screen.getByLabelText('task title: Upload photo'), { target: { value: 'Saved work' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The task was saved, but the board could not be refreshed');
    expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh board' }));
    await screen.findByRole('button', { name: 'Add task to Upload photo' });
    expect(api.createTask).toHaveBeenCalledOnce();
    expect(api.getBoard).toHaveBeenCalledTimes(3);
  });

  it.each(['product_backlog', 'active_sprint', 'completed'])('shows nested work without breakdown editing in %s', async (stage) => {
    api.getBoard.mockResolvedValue({ ...board, pbis: [{ ...pbi, stage }] });
    renderBoard();
    await screen.findByText('Build API');
    expect(screen.getByText('Validate input')).toBeInTheDocument();
    expect(screen.getByText('API details')).toBeInTheDocument();
    expect(screen.getByText('Check types')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add (sub-)?task|Edit (sub-)?task/ })).not.toBeInTheDocument();
  });

  it('keeps ids and nested work visible after starting a sprint', async () => {
    const planned = { ...pbi, estimated_hours: '4.00', planned_start_date: '2026-10-04', planned_end_date: '2026-10-10' };
    api.getBoard.mockResolvedValueOnce({ ...board, sprints: [{ id: '3', status: 'planning' }], pbis: [planned] })
      .mockResolvedValue({ ...board, sprints: [{ id: '3', status: 'active' }], pbis: [{ ...planned, stage: 'active_sprint', sprint_id: '3' }] });
    api.startSprint.mockResolvedValue({});
    renderBoard();
    fireEvent.click(await screen.findByRole('button', { name: 'Start Sprint' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Add task to Upload photo' })).not.toBeInTheDocument());
    const active = screen.getByRole('heading', { name: 'Active Sprint' }).closest('section');
    expect(within(active).getByText('Build API')).toBeInTheDocument();
    expect(within(active).getByText('Validate input')).toBeInTheDocument();
    expect(api.startSprint).toHaveBeenCalledWith('7', '3', 'tok');
  });
});
