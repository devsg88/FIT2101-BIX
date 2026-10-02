import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { createProject } from '../../services/api.js';

// "+ Create Project" (US-04d): the Admin names a new project and becomes its
// responsible Admin. There is no Figma screen for this flow, so it reuses the
// Assign Developer modal's structure and classes (TeamDetail.jsx) as-is -
// no new styling.
//
// The server decides who owns the project (the logged-in Admin, from the
// token) and creates its empty four-stage board as part of the project, so
// this form only sends the name.
export default function CreateProjectModal({ onClose }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdProject, setCreatedProject] = useState(null);

  // Blocks a second submit (e.g. a fast double-click) before React has
  // re-rendered the button as disabled, so one click creates one project.
  const submittingRef = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('A project name is required');
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    setError(null);

    try {
      const { project } = await createProject(trimmedName, user.token);
      setCreatedProject(project);
    } catch (err) {
      // Keep the typed name so the Admin can correct it and try again.
      setError(err.message || 'The project could not be created. Please try again.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Closing is blocked while the request is in flight, so the modal can't be
  // dismissed on a request that then succeeds without the Admin seeing it.
  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={handleClose}>
      <div
        className="admin-modal admin-modal--assign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__top">
          <h2 id="create-project-title">Create Project</h2>
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

        {createdProject ? (
          <>
            <p className="admin-modal__subtitle" role="status">
              {createdProject.name} has been created and you are responsible for it.
              Its board is ready with the Product Backlog, Sprint Planning, Active
              Sprint and Completed stages.
            </p>

            <div className="admin-modal__actions">
              <button type="button" className="admin-btn admin-btn--filter" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="admin-btn admin-btn--solid"
                onClick={() => navigate(`/projects/${createdProject.id}/board`)}
              >
                Open Board
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <p className="admin-modal__subtitle">
              <label htmlFor="create-project-name">Project name</label>
            </p>
            <input
              id="create-project-name"
              type="text"
              className="admin-modal__search"
              placeholder="Enter a project name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'create-project-error' : undefined}
              autoFocus
            />

            {error && (
              <p id="create-project-error" className="login-error" role="alert">
                {error}
              </p>
            )}

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
                {isSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
