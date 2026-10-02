import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CreateProjectModal from './CreateProjectModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { createProject } from '../../services/api.js';

vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api.js', () => ({ createProject: vi.fn() }));

const onClose = vi.fn();

// Renders the modal on the dashboard route, with a stand-in board route so
// "Open Board" navigation can be checked.
function renderModal() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<CreateProjectModal onClose={onClose} />} />
        <Route path="/projects/:projectId/board" element={<p>Board page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

function typeName(value) {
  fireEvent.change(screen.getByLabelText('Project name'), { target: { value } });
}

// A promise the test resolves/rejects by hand, to observe the in-flight state.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('CreateProjectModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok-admin' } });
  });

  it('renders the Create Project dialog with a name field', () => {
    renderModal();

    expect(screen.getByRole('dialog', { name: 'Create Project' })).toBeInTheDocument();
    expect(screen.getByLabelText('Project name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '    ']
  ])('shows an error and does not call the API for an %s name', (_label, value) => {
    renderModal();
    typeName(value);

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByRole('alert')).toHaveTextContent('A project name is required');
    expect(createProject).not.toHaveBeenCalled();
  });

  it('sends the trimmed name with the logged-in Admin token', async () => {
    createProject.mockResolvedValue({ project: { id: 10, name: 'New Project' } });
    renderModal();
    typeName('  New Project  ');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => expect(createProject).toHaveBeenCalledWith('New Project', 'tok-admin'));
  });

  it('disables the form while creating and sends only one request for repeated submits', async () => {
    const pending = deferred();
    createProject.mockReturnValue(pending.promise);
    renderModal();
    typeName('New Project');

    const form = screen.getByRole('button', { name: 'Create' }).closest('form');
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(createProject).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();

    pending.resolve({ project: { id: 10, name: 'New Project' } });
    await screen.findByRole('status');
  });

  it('shows the server error and keeps the typed name when creation fails', async () => {
    createProject.mockRejectedValue(new Error('Failed to create the project'));
    renderModal();
    typeName('New Project');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to create the project');
    expect(screen.getByLabelText('Project name')).toHaveValue('New Project');
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('confirms creation, including the empty four-stage board, and offers Open Board', async () => {
    createProject.mockResolvedValue({
      project: { id: 10, name: 'New Project', responsible_admin_id: 3 }
    });
    renderModal();
    typeName('New Project');

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    const confirmation = await screen.findByRole('status');
    expect(confirmation).toHaveTextContent('New Project has been created and you are responsible for it.');
    expect(confirmation).toHaveTextContent(
      'Product Backlog, Sprint Planning, Active Sprint and Completed'
    );
    expect(screen.queryByLabelText('Project name')).not.toBeInTheDocument();
  });

  it('Open Board navigates to the new project board', async () => {
    createProject.mockResolvedValue({ project: { id: 10, name: 'New Project' } });
    renderModal();
    typeName('New Project');
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByRole('status');

    fireEvent.click(screen.getByRole('button', { name: 'Open Board' }));

    expect(screen.getByText('Board page')).toBeInTheDocument();
  });

  it('Cancel closes the modal without creating anything', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(createProject).not.toHaveBeenCalled();
  });
});
