import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Board from './Board.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { getBoard, getProjectMembers, updateWorkItemRoles } from '../services/api.js';

// US-09 (SCRUM-178): tagging the sprint's Scrum Master and Product Owner on
// the real Board page and BoardContext. Only the API and login are faked.
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../services/api.js');

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/projects/7/board']}>
      <Routes>
        <Route path="/projects/:projectId/board" element={<Board />} />
      </Routes>
    </MemoryRouter>
  );
}

const members = [
  { id: '1', name: 'Pang', email: 'pang@bix.app', role: 'developer' },
  { id: '2', name: 'Developer', email: 'developer@bix.app', role: 'developer' }
];

function board({ planningRoles = {}, activeRoles = {} } = {}) {
  return {
    project: { id: '7', name: 'BIX Platform', current_focus_pbi_id: null },
    sprints: [
      { id: '2', name: 'Sprint 2', status: 'active', scrum_master_id: null, scrum_master_name: null, product_owner_identifier: null, ...activeRoles },
      { id: '3', name: 'Sprint 3', status: 'planning', scrum_master_id: null, scrum_master_name: null, product_owner_identifier: null, ...planningRoles }
    ],
    pbis: [
      { id: 1, title: 'Reset password', stage: 'product_backlog', tasks: [] },
      { id: 2, title: 'Upload photo', stage: 'sprint_planning', sprint_id: null, tasks: [] },
      { id: 3, title: 'Login form', stage: 'active_sprint', sprint_id: '2', tasks: [] }
    ]
  };
}

// The roles panel for one sprint, found by the sprint's name.
function panelFor(sprintName) {
  return screen.getByText(sprintName, { selector: '.sprint-roles__sprint-name' }).closest('.sprint-roles');
}

describe('Board page - sprint roles (US-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 1, role: 'developer', token: 'tok' } });
    getProjectMembers.mockResolvedValue({ members });
    updateWorkItemRoles.mockResolvedValue({ sprint: {} });
  });

  it('shows a roles panel for the planning and active sprints only', async () => {
    getBoard.mockResolvedValue(board());

    renderBoard();

    await waitFor(() => expect(screen.getByText('Reset password')).toBeInTheDocument());
    expect(panelFor('Sprint 3')).toBeInTheDocument();
    expect(panelFor('Sprint 2')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit roles' })).toHaveLength(2);
  });

  it('shows saved roles in the panel and on the cards of that sprint (AC3)', async () => {
    getBoard.mockResolvedValue(
      board({
        activeRoles: { scrum_master_id: '1', scrum_master_name: 'Pang', product_owner_identifier: 'client@example.com' }
      })
    );

    renderBoard();

    await waitFor(() => expect(screen.getByText('Login form')).toBeInTheDocument());
    expect(within(panelFor('Sprint 2')).getByText('@Pang')).toBeInTheDocument();
    const activeCard = screen.getByRole('heading', { name: 'Login form' }).closest('article');
    expect(within(activeCard).getByText('SM: @Pang')).toBeInTheDocument();
    expect(within(activeCard).getByText('PO: client@example.com')).toBeInTheDocument();
    // The planning sprint has no roles, so its card shows none.
    const planningCard = screen.getByRole('heading', { name: 'Upload photo' }).closest('article');
    expect(within(planningCard).queryByText(/SM:/)).not.toBeInTheDocument();
  });

  it('tags a Scrum Master with @ and a Product Owner, saves, and shows them after refresh', async () => {
    getBoard
      .mockResolvedValueOnce(board())
      .mockResolvedValueOnce(
        board({
          planningRoles: { scrum_master_id: '1', scrum_master_name: 'Pang', product_owner_identifier: 'client@example.com' }
        })
      );

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());
    const panel = panelFor('Sprint 3');
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit roles' }));

    const input = within(panel).getByRole('combobox', { name: 'Scrum Master' });
    fireEvent.change(input, { target: { value: '@pa' } });
    await waitFor(() => expect(within(panel).getByRole('option', { name: /@Pang/ })).toBeInTheDocument());
    fireEvent.mouseDown(within(panel).getByRole('option', { name: /@Pang/ }));
    fireEvent.change(within(panel).getByPlaceholderText('Email or name'), {
      target: { value: ' client@example.com ' }
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roles' }));

    await waitFor(() =>
      expect(updateWorkItemRoles).toHaveBeenCalledWith('7', '3', 1, 'client@example.com', 'tok')
    );
    await waitFor(() =>
      expect(within(panelFor('Sprint 3')).getByText('@Pang')).toBeInTheDocument()
    );
    const planningCard = screen.getByRole('heading', { name: 'Upload photo' }).closest('article');
    expect(within(planningCard).getByText('SM: @Pang')).toBeInTheDocument();
  });

  it('shows the 400 for a fake Scrum Master and keeps the form open (AC4)', async () => {
    getBoard.mockResolvedValue(board());
    updateWorkItemRoles.mockRejectedValue(
      Object.assign(new Error('The Scrum Master must be an existing user'), { status: 400 })
    );

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());
    const panel = panelFor('Sprint 3');
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit roles' }));
    fireEvent.change(within(panel).getByRole('combobox', { name: 'Scrum Master' }), {
      target: { value: '@' }
    });
    fireEvent.mouseDown(within(panel).getByRole('option', { name: /@Developer/ }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roles' }));

    expect(await within(panel).findByRole('alert')).toHaveTextContent(
      'The Scrum Master must be an existing user'
    );
    expect(within(panel).getByRole('button', { name: 'Save roles' })).toBeInTheDocument();
    expect(getBoard).toHaveBeenCalledTimes(1);
  });

  it('clears both roles by removing the tag and emptying the Product Owner', async () => {
    getBoard.mockResolvedValue(
      board({ planningRoles: { scrum_master_id: '1', scrum_master_name: 'Pang', product_owner_identifier: 'Jane' } })
    );

    renderBoard();

    await waitFor(() => expect(screen.getByText('Upload photo')).toBeInTheDocument());
    const panel = panelFor('Sprint 3');
    fireEvent.click(within(panel).getByRole('button', { name: 'Edit roles' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove @Pang as Scrum Master' }));
    fireEvent.change(within(panel).getByPlaceholderText('Email or name'), { target: { value: '' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Save roles' }));

    await waitFor(() =>
      expect(updateWorkItemRoles).toHaveBeenCalledWith('7', '3', null, null, 'tok')
    );
  });
});
