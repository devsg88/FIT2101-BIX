import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PbiFormModal from './PbiFormModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { createPbi, updatePbi } from '../../services/api.js';

vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/api.js', () => ({ createPbi: vi.fn(), updatePbi: vi.fn() }));

const onSaved = vi.fn();
const onClose = vi.fn();

const EXISTING = {
  id: 4,
  title: 'User can reset password',
  description: 'Send a reset link',
  stage: 'product_backlog'
};

function renderModal(pbi = null) {
  return render(
    <PbiFormModal projectId="1" pbi={pbi} onSaved={onSaved} onClose={onClose} />
  );
}

function type(label, value) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit(name) {
  fireEvent.click(screen.getByRole('button', { name }));
}

// A promise the test settles by hand, to observe the in-flight state.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('PbiFormModal - create (US-04b, SCRUM-101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok' } });
  });

  it('shows an empty create form', () => {
    renderModal();

    expect(screen.getByRole('heading', { name: 'New Backlog Item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('');
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Create item' })).toBeInTheDocument();
  });

  it('requires a title and sends nothing without one', () => {
    renderModal();

    type('Title', '   ');
    submit('Create item');

    expect(screen.getByRole('alert')).toHaveTextContent('A title is required');
    expect(createPbi).not.toHaveBeenCalled();
  });

  it('creates a PBI with the trimmed title and description, then reports it', async () => {
    const created = { id: 9, title: 'New item', description: 'Details' };
    createPbi.mockResolvedValue({ pbi: created });
    renderModal();

    type('Title', '  New item ');
    type('Description (optional)', ' Details ');
    submit('Create item');

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(created));
    expect(createPbi).toHaveBeenCalledWith('1', { title: 'New item', description: 'Details' }, 'tok');
  });

  it('leaves out an empty description', async () => {
    createPbi.mockResolvedValue({ pbi: { id: 9 } });
    renderModal();

    type('Title', 'Only a title');
    submit('Create item');

    await waitFor(() => expect(createPbi).toHaveBeenCalledWith('1', { title: 'Only a title' }, 'tok'));
  });

  it("shows the server's message and keeps what was typed when saving fails", async () => {
    createPbi.mockRejectedValue(new Error('You are not responsible for this project'));
    renderModal();

    type('Title', 'Keep me');
    submit('Create item');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You are not responsible for this project'
    );
    expect(screen.getByLabelText('Title')).toHaveValue('Keep me');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('disables the form and blocks closing while saving, and sends only one request', async () => {
    const pending = deferred();
    createPbi.mockReturnValue(pending.promise);
    renderModal();

    type('Title', 'Slow');
    submit('Create item');
    fireEvent.submit(screen.getByLabelText('Title').closest('form'));

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    expect(screen.getByLabelText('Title')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(createPbi).toHaveBeenCalledTimes(1);

    pending.resolve({ pbi: { id: 1 } });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('closes on Cancel', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalled();
  });
});

describe('PbiFormModal - edit (US-04b, SCRUM-101)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ user: { id: 3, role: 'admin', token: 'tok' } });
  });

  it('opens pre-filled with the PBI', () => {
    renderModal(EXISTING);

    expect(screen.getByRole('heading', { name: 'Edit Backlog Item' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('User can reset password');
    expect(screen.getByLabelText('Description (optional)')).toHaveValue('Send a reset link');
  });

  it('pre-fills an empty description for a PBI with none', () => {
    renderModal({ ...EXISTING, description: null });

    expect(screen.getByLabelText('Description (optional)')).toHaveValue('');
  });

  it('sends only the fields that changed', async () => {
    const updated = { ...EXISTING, title: 'Reset password by email' };
    updatePbi.mockResolvedValue({ pbi: updated });
    renderModal(EXISTING);

    type('Title', 'Reset password by email');
    submit('Save changes');

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated));
    expect(updatePbi).toHaveBeenCalledWith('1', 4, { title: 'Reset password by email' }, 'tok');
  });

  it('clears the description by sending null', async () => {
    updatePbi.mockResolvedValue({ pbi: { ...EXISTING, description: null } });
    renderModal(EXISTING);

    type('Description (optional)', '  ');
    submit('Save changes');

    await waitFor(() =>
      expect(updatePbi).toHaveBeenCalledWith('1', 4, { description: null }, 'tok')
    );
  });

  it('just closes, with no request, when nothing changed', () => {
    renderModal(EXISTING);

    type('Title', ' User can reset password ');
    submit('Save changes');

    expect(updatePbi).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('will not save a blank title', () => {
    renderModal(EXISTING);

    type('Title', '');
    submit('Save changes');

    expect(screen.getByRole('alert')).toHaveTextContent('A title is required');
    expect(updatePbi).not.toHaveBeenCalled();
  });
});
