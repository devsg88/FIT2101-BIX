import { useState } from 'react';
import { useBoard } from '../../context/BoardContext.jsx';
import ActionError from '../common/ActionError.jsx';

export default function WorkItemEditor({ kind, parentId, parentTitle, item }) {
  const { saveTask, saveSubTask, reloadBoard } = useBoard();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);
  const label = kind === 'task' ? 'task' : 'sub-task';
  const subject = item?.title ?? parentTitle;

  function openEditor() {
    setTitle(item?.title ?? '');
    setDescription(item?.description ?? '');
    setError(null);
    setSaved(false);
    setIsOpen(true);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim()) {
      setError(new Error('A non-empty title is required'));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const save = kind === 'task' ? saveTask : saveSubTask;
      await save(parentId, item?.id, {
        title: title.trim(), description: description.trim() || null
      });
      setIsOpen(false);
    } catch (err) {
      setError(err);
      setSaved(Boolean(err.saved));
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        className="project-board__work-action"
        type="button"
        onClick={openEditor}
        aria-label={item ? `Edit ${label}: ${subject}` : `Add ${label} to ${subject}`}
      >
        {item ? `Edit ${label}` : `Add ${label}`}
      </button>
    );
  }

  return (
    <form className="project-board__work-form" onSubmit={handleSubmit} noValidate
      aria-label={`${item ? 'Edit' : 'New'} ${label}: ${subject}`}>
      <label className="project-board__planning-label">
        Title
        <input aria-label={`${label} title: ${subject}`} required autoFocus
          value={title} onChange={(event) => setTitle(event.target.value)}
          disabled={isSaving || saved} />
      </label>
      <label className="project-board__planning-label">
        Description
        <textarea aria-label={`${label} description: ${subject}`} rows={3}
          value={description} onChange={(event) => setDescription(event.target.value)}
          disabled={isSaving || saved} />
      </label>
      <div className="project-board__work-actions">
        <button type="submit" disabled={isSaving || saved} aria-busy={isSaving}>
          {isSaving ? 'Saving...' : `${item ? 'Save' : 'Create'} ${label}`}
        </button>
        {!saved && <button type="button" disabled={isSaving} onClick={() => setIsOpen(false)}>Cancel</button>}
        {saved && <button type="button" onClick={reloadBoard}>Refresh board</button>}
      </div>
      <ActionError error={error} fallback={`Could not save this ${label}.`} />
    </form>
  );
}
