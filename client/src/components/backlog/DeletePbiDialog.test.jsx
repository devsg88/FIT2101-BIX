import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DeletePbiDialog from './DeletePbiDialog.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { deletePbi } from '../../services/api.js';

vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api.js', () => ({ deletePbi: vi.fn() }));

const onDeleted = vi.fn();
const onClose = vi.fn();
const PBI = { id: 4, title: 'Login page', stage: 'completed' };

function renderDialog() {
  return render(
    <DeletePbiDialog projectId="1" pbi={PBI} onDeleted={onDeleted} onClose={onClose} />
  );
}

describe('DeletePbiDialog (US-04b, SCRUM-102)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok' } });
  });

  it('asks for confirmation, naming the item, and deletes nothing yet', () => {
    renderDialog();

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toHaveTextContent('Login page');
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it('deletes only after Delete is pressed, then reports it', async () => {
    deletePbi.mockResolvedValue({ pbi: PBI });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(PBI));
    expect(deletePbi).toHaveBeenCalledWith('1', 4, 'tok');
  });

  it('Cancel closes without deleting', () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
    expect(deletePbi).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the delete is refused, and stays open", async () => {
    deletePbi.mockRejectedValue(
      new Error('Cannot delete a PBI that still has tasks. Remove its tasks first.')
    );
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('still has tasks');
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('blocks closing and a second delete while the request is in flight', async () => {
    let finish;
    deletePbi.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deleting...' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(deletePbi).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    finish({ pbi: PBI });
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });
});
