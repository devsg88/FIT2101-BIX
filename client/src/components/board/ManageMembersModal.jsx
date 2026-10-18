import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  addProjectMember,
  getAvailableDevelopers,
  getProjectMembers,
  removeProjectMember
} from '../../services/api.js';
import ActionError from '../common/ActionError.jsx';

// US-03/US-05: closes the gap found in the NFR-01 frontend audit - there was
// previously no way to add or remove a developer from a project anywhere in
// the running app; TeamDetail.jsx's "Assign Developer" modal only ever wrote
// to local React state over client/src/data/orgMockData.js, never the
// database. This reuses that modal's exact markup/classes (admin-modal__*,
// admin-status-pill) since it's the same shape of UI - search, pick a
// developer, confirm - just wired to the real project_members endpoints
// instead of mock data.
//
// Both lists (current members, available developers) are refetched from the
// server after every add/remove, the same "trust what the server now says,
// not a locally patched guess" pattern BoardContext uses everywhere else -
// so a member removed here is reflected correctly even if someone else
// changed membership at the same time.
export default function ManageMembersModal({ projectId, onClose }) {
  const { user } = useAuth();
  const token = user?.token;

  const [members, setMembers] = useState([]);
  const [membersStatus, setMembersStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [availableDevelopers, setAvailableDevelopers] = useState([]);
  const [availableStatus, setAvailableStatus] = useState('loading');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  // The id of whichever row (add or remove) currently has a request in
  // flight, so only that one row shows "Adding.../Removing..." rather than
  // disabling the whole modal for one action.
  const [pendingUserId, setPendingUserId] = useState(null);

  const loadMembers = () => {
    setMembersStatus('loading');
    getProjectMembers(projectId, token)
      .then((data) => {
        setMembers(Array.isArray(data?.members) ? data.members : []);
        setMembersStatus('ready');
      })
      .catch(() => setMembersStatus('error'));
  };

  const loadAvailableDevelopers = () => {
    setAvailableStatus('loading');
    getAvailableDevelopers(projectId, token)
      .then((data) => {
        setAvailableDevelopers(Array.isArray(data?.developers) ? data.developers : []);
        setAvailableStatus('ready');
      })
      .catch(() => setAvailableStatus('error'));
  };

  useEffect(() => {
    loadMembers();
    loadAvailableDevelopers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, token]);

  const filteredCandidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return availableDevelopers;
    }
    return availableDevelopers.filter(
      (developer) =>
        developer.name.toLowerCase().includes(query) ||
        developer.email.toLowerCase().includes(query)
    );
  }, [availableDevelopers, searchQuery]);

  const handleAdd = async (developer) => {
    setPendingUserId(developer.id);
    setError(null);
    try {
      await addProjectMember(projectId, developer.id, token);
      loadMembers();
      loadAvailableDevelopers();
    } catch (err) {
      setError(err);
    } finally {
      setPendingUserId(null);
    }
  };

  const handleRemove = async (member) => {
    setPendingUserId(member.id);
    setError(null);
    try {
      await removeProjectMember(projectId, member.id, token);
      loadMembers();
      loadAvailableDevelopers();
    } catch (err) {
      setError(err);
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal admin-modal--assign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-members-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__top">
          <h2 id="manage-members-title">Manage Members</h2>
          <button type="button" className="admin-modal__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="admin-modal__subtitle">Current members</p>
        {membersStatus === 'loading' && <p className="admin-modal__empty">Loading members...</p>}
        {membersStatus === 'error' && (
          <p className="admin-modal__empty" role="alert">Couldn&apos;t load members.</p>
        )}
        {membersStatus === 'ready' && (
          <div className="admin-modal__list">
            {members.length === 0 && (
              <p className="admin-modal__empty">No developers are on this project yet.</p>
            )}
            {members.map((member) => (
              <div className="admin-modal__row" key={member.id}>
                <span className="admin-modal__row-info">
                  <strong>{member.name}</strong>
                  <span className="admin-modal__row-email">{member.email}</span>
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn--filter"
                  onClick={() => handleRemove(member)}
                  disabled={pendingUserId === member.id}
                >
                  {pendingUserId === member.id ? 'Removing...' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}

        <p className="admin-modal__subtitle">Add a developer</p>
        <input
          type="text"
          className="admin-modal__search"
          placeholder="Search developers..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search developers"
        />

        {availableStatus === 'loading' && (
          <p className="admin-modal__empty">Loading available developers...</p>
        )}
        {availableStatus === 'error' && (
          <p className="admin-modal__empty" role="alert">Couldn&apos;t load available developers.</p>
        )}
        {availableStatus === 'ready' && (
          <div className="admin-modal__list">
            {filteredCandidates.length === 0 && (
              <p className="admin-modal__empty">
                {availableDevelopers.length === 0
                  ? 'Every developer is already on this project.'
                  : 'No developers match your search.'}
              </p>
            )}
            {filteredCandidates.map((developer) => (
              <div className="admin-modal__row" key={developer.id}>
                <span className="admin-modal__row-info">
                  <strong>{developer.name}</strong>
                  <span className="admin-modal__row-email">{developer.email}</span>
                </span>
                <button
                  type="button"
                  className="admin-btn admin-btn--solid"
                  onClick={() => handleAdd(developer)}
                  disabled={pendingUserId === developer.id}
                >
                  {pendingUserId === developer.id ? 'Adding...' : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}

        <ActionError error={error} fallback="Something went wrong. Please try again." />

        <div className="admin-modal__actions">
          <button type="button" className="admin-btn admin-btn--filter" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
