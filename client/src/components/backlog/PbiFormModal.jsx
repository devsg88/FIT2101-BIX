import { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { createPbi, updatePbi } from '../../services/api.js';
import ActionError from '../common/ActionError.jsx';

// US-04b / SCRUM-101. One modal for both creating a PBI (no `pbi` prop) and
// editing an existing one (`pbi` given). Reuses the admin modal styling from
// CreateProjectModal.jsx - no new modal styles.
//
// Captures title (required) and description (optional) - the fields the
// backend accepts. Priority will be added here once the backend has it.
// Edit sends only the fields that actually changed; if nothing changed, the
// modal just closes without a request.
export default function PbiFormModal({ projectId, pbi = null, onSaved, onClose }) {
  const { user } = useAuth();
  const isEdit = pbi !== null;

  const [title, setTitle] = useState(pbi?.title ?? '');
  const [description, setDescription] = useState(pbi?.description ?? '');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Blocks a second submit (e.g. a fast double-click) before React has
  // re-rendered the button as disabled.
  const submittingRef = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle) {
      setError(new Error('A title is required'));
      return;
    }

    let payload;
    if (isEdit) {
      payload = {};
      if (trimmedTitle !== pbi.title) {
        payload.title = trimmedTitle;
      }
      if (trimmedDescription !== (pbi.description ?? '')) {
        // An emptied description is sent as null, which clears it.
        payload.description = trimmedDescription || null;
      }
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
    } else {
      payload = { title: trimmedTitle };
      if (trimmedDescription) {
        payload.description = trimmedDescription;
      }
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = isEdit
        ? await updatePbi(projectId, pbi.id, payload, user.token)
        : await createPbi(projectId, payload, user.token);
      onSaved(result.pbi);
    } catch (err) {
      // Keep what was typed so the Admin can correct it and try again.
      setError(err);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Closing is blocked while a request is in flight, so the modal can't be
  // dismissed on a save that then succeeds unseen.
  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  const heading = isEdit ? 'Edit Backlog Item' : 'New Backlog Item';

  return (
    <div className="admin-modal-overlay" onClick={handleClose}>
      <div
        className="admin-modal admin-modal--assign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pbi-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__top">
          <h2 id="pbi-form-title">{heading}</h2>
          <button
            type="button"
            className="admin-modal__close"
            aria-label="Close"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <p className="admin-modal__subtitle">
            <label htmlFor="pbi-form-title-input">Title</label>
          </p>
          <input
            id="pbi-form-title-input"
            type="text"
            className="admin-modal__search"
            placeholder="e.g. As a user, I can reset my password"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'pbi-form-error' : undefined}
            autoFocus
          />

          <p className="admin-modal__subtitle">
            <label htmlFor="pbi-form-description-input">Description (optional)</label>
          </p>
          <textarea
            id="pbi-form-description-input"
            className="admin-modal__search pbi-form__description"
            rows={4}
            placeholder="Details, acceptance criteria, notes..."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
          />

          <ActionError
            id="pbi-form-error"
            error={error}
            fallback="The item could not be saved. Please try again."
            className="login-error"
          />

          <div className="admin-modal__actions">
            <button
              type="button"
              className="admin-btn admin-btn--filter"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="admin-btn admin-btn--solid" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : isEdit ? 'Save changes' : 'Create item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
