import { useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { deletePbi } from '../../services/api.js';
import ActionError from '../common/ActionError.jsx';

// US-04b / SCRUM-102. "Are you sure?" confirmation before deleting a PBI.
// Nothing is deleted until the Admin presses Delete here. If the backend
// refuses (Active Sprint, still has tasks, not responsible, ...), its
// message is shown in the dialog and the PBI stays where it was.
export default function DeletePbiDialog({ projectId, pbi, onDeleted, onClose }) {
  const { user } = useAuth();
  const [error, setError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingRef = useRef(false);

  const handleDelete = async () => {
    if (deletingRef.current) {
      return;
    }
    deletingRef.current = true;
    setIsDeleting(true);
    setError(null);

    try {
      await deletePbi(projectId, pbi.id, user.token);
      onDeleted(pbi);
    } catch (err) {
      setError(err);
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={handleClose}>
      <div
        className="admin-modal admin-modal--assign"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-pbi-title"
        aria-describedby="delete-pbi-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__top">
          <h2 id="delete-pbi-title">Delete this item?</h2>
          <button
            type="button"
            className="admin-modal__close"
            aria-label="Close"
            onClick={handleClose}
            disabled={isDeleting}
          >
            ×
          </button>
        </div>

        <p id="delete-pbi-description" className="admin-modal__subtitle">
          Are you sure you want to delete &ldquo;{pbi.title}&rdquo;? This cannot be undone.
        </p>

        <ActionError
          error={error}
          fallback="The item could not be deleted. Please try again."
          className="login-error"
        />

        <div className="admin-modal__actions">
          <button
            type="button"
            className="admin-btn admin-btn--filter"
            onClick={handleClose}
            disabled={isDeleting}
            autoFocus
          >
            Cancel
          </button>
          <button
            type="button"
            className="admin-btn admin-btn--danger"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
