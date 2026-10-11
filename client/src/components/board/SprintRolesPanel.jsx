import { useState } from 'react';
import { useBoard } from '../../context/BoardContext.jsx';
import ScrumMasterSelect from './ScrumMasterSelect.jsx';
import WorkItemRoles from './WorkItemRoles.jsx';

// US-09 / SCRUM-178. A sprint's Scrum Master and Product Owner, at the top of
// the Sprint Planning / Active Sprint column, with an Edit form. Everyone who
// can open the board may edit (the backend allows the responsible Admin and
// Developer members). A refused save - such as the 400 for a Scrum Master who
// is not a real user on this project (AC4) - is shown as the server's message
// and the form stays open.
export default function SprintRolesPanel({ sprint }) {
  const { members, saveSprintRoles } = useBoard();
  const [isEditing, setIsEditing] = useState(false);
  const [scrumMasterId, setScrumMasterId] = useState(null);
  const [productOwner, setProductOwner] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const openEditor = () => {
    setScrumMasterId(sprint.scrum_master_id ?? null);
    setProductOwner(sprint.product_owner_identifier ?? '');
    setError(null);
    setIsEditing(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      // The board's ids may be strings (pg bigint); the API wants a number.
      const id = scrumMasterId === null ? null : Number(scrumMasterId);
      const owner = productOwner.trim() === '' ? null : productOwner.trim();
      await saveSprintRoles(sprint.id, id, owner);
      setIsEditing(false);
    } catch (err) {
      setError(err?.message || 'Something went wrong saving the roles. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="sprint-roles">
      <p className="sprint-roles__sprint-name">{sprint.name}</p>
      {!isEditing && (
        <>
          <WorkItemRoles sprint={sprint} />
          <button type="button" className="sprint-roles__edit" onClick={openEditor}>
            Edit roles
          </button>
        </>
      )}
      {isEditing && (
        <form className="sprint-roles__form" onSubmit={handleSubmit}>
          <label className="sprint-roles__label" htmlFor={`sprint-${sprint.id}-sm`}>
            Scrum Master
          </label>
          <div id={`sprint-${sprint.id}-sm`}>
            <ScrumMasterSelect
              members={members}
              value={scrumMasterId}
              selectedName={
                String(scrumMasterId) === String(sprint.scrum_master_id)
                  ? sprint.scrum_master_name
                  : undefined
              }
              onChange={(id) => setScrumMasterId(id ?? null)}
            />
          </div>
          <label className="sprint-roles__label">
            Product Owner
            <input
              type="text"
              maxLength={255}
              placeholder="Email or name"
              value={productOwner}
              onChange={(event) => setProductOwner(event.target.value)}
            />
          </label>
          <div className="sprint-roles__actions">
            <button type="submit" disabled={isSaving} aria-busy={isSaving}>
              {isSaving ? 'Saving...' : 'Save roles'}
            </button>
            <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving}>
              Cancel
            </button>
          </div>
          {error && (
            <p className="project-board__card-error" role="alert">{error}</p>
          )}
        </form>
      )}
    </div>
  );
}
