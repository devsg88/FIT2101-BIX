import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ScrumMasterSelect from './ScrumMasterSelect.jsx';

// US-09 (SCRUM-178), AC1: tag a Scrum Master with an @ reference.

const members = [
  { id: '1', name: 'Pang', email: 'pang@bix.app' },
  { id: '2', name: 'Developer', email: 'developer@bix.app' }
];

function renderSelect(props = {}) {
  const onChange = vi.fn();
  render(<ScrumMasterSelect members={members} value={null} onChange={onChange} {...props} />);
  return { onChange, input: screen.queryByRole('combobox', { name: 'Scrum Master' }) };
}

describe('ScrumMasterSelect', () => {
  it('lists every project member after typing @', () => {
    const { input } = renderSelect();

    fireEvent.change(input, { target: { value: '@' } });

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('@Pang');
    expect(options[0]).toHaveTextContent('pang@bix.app');
  });

  it('narrows the list by name or email after the @', () => {
    const { input } = renderSelect();

    fireEvent.change(input, { target: { value: '@dev' } });

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option')).toHaveTextContent('@Developer');
  });

  it('shows no list until the text starts with @', () => {
    const { input } = renderSelect();

    fireEvent.change(input, { target: { value: 'Pang' } });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByText('Start with @ to search project members.')).toBeInTheDocument();
  });

  it('says so when no member matches, and never saves the typed text', () => {
    const { input, onChange } = renderSelect();

    fireEvent.change(input, { target: { value: '@nobody' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByRole('status')).toHaveTextContent('No project member matches @nobody.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('selects a member by clicking, passing the user id', () => {
    const { input, onChange } = renderSelect();

    fireEvent.change(input, { target: { value: '@pa' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /@Pang/ }));

    expect(onChange).toHaveBeenCalledWith('1', members[0]);
  });

  it('selects a member with the arrow keys and Enter', () => {
    const { input, onChange } = renderSelect();

    fireEvent.change(input, { target: { value: '@' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith('2', members[1]);
  });

  it('shows the selected member as an @ chip that can be removed', () => {
    const { onChange } = renderSelect({ value: '2' });

    expect(screen.getByText('@Developer')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove @Developer as Scrum Master' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('uses selectedName for a Scrum Master who is not in the member list', () => {
    renderSelect({ value: '3', selectedName: 'Admin' });

    expect(screen.getByText('@Admin')).toBeInTheDocument();
  });
});
