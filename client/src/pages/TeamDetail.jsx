import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import AdminSidebar from '../components/dashboard/AdminSidebar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { addTeamMember, getAvailableDevelopersForTeam, getTeamMembers, removeTeamMember } from '../services/api.js';

// Handles the logic for the assign developer popup. developers is the real
// candidate list from GET /api/teams/:teamId/available-developers (already
// excludes current members and non-developers server-side - see
// teamController.js), so there is no client-side "already on another team"
// cross-check here the way the old mock-data version had: nothing in the
// real schema models one-developer-per-team as a rule (teamModel.js: "a
// developer's team and the projects they can access are tracked
// independently"), so every returned candidate is genuinely assignable.
function AssignDeveloperModal({ teamName, developers, onAssign, onClose, isSubmitting }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeveloperId, setSelectedDeveloperId] = useState(null);

  const candidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return developers;
    }
    return developers.filter(
      (developer) =>
        developer.name.toLowerCase().includes(query) ||
        developer.email.toLowerCase().includes(query)
    );
  }, [searchQuery, developers]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (selectedDeveloperId == null) {
      return;
    }
    onAssign(selectedDeveloperId);
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal admin-modal--assign"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-developer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal__top">
          <h2 id="assign-developer-title">Assign Developer</h2>
          <button type="button" className="admin-modal__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        <p className="admin-modal__subtitle">Select a developer to assign to {teamName}</p>

        <input
          type="text"
          className="admin-modal__search"
          placeholder="Search developers..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          aria-label="Search developers"
        />

        <form onSubmit={handleSubmit}>
          <div className="admin-modal__list">
            {candidates.length === 0 && (
              <p className="admin-modal__empty">No developers match your search.</p>
            )}

            {candidates.map((developer) => {
              const isSelected = selectedDeveloperId === developer.id;

              return (
                <button
                  type="button"
                  key={developer.id}
                  className={`admin-modal__row ${isSelected ? 'admin-modal__row--selected' : ''}`}
                  onClick={() => setSelectedDeveloperId(developer.id)}
                >
                  <span className="admin-modal__row-info">
                    <strong>{developer.name}</strong>
                    <span className="admin-modal__row-email">{developer.email}</span>
                  </span>
                  <span className="admin-status-pill admin-status-pill--active">Available</span>
                </button>
              );
            })}
          </div>

          <div className="admin-modal__actions">
            <button type="button" className="admin-btn admin-btn--filter" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="admin-btn admin-btn--solid"
              disabled={selectedDeveloperId == null || isSubmitting}
            >
              {isSubmitting ? 'Assigning...' : 'Assign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamDetail() {
  const { teamId } = useParams();
  const { user } = useAuth();
  const token = user?.token;

  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  // 'loading' | 'ready' | 'not-found' | 'error'
  const [status, setStatus] = useState('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [availableDevelopers, setAvailableDevelopers] = useState([]);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let isMounted = true;
    setStatus('loading');

    getTeamMembers(teamId, token)
      .then((data) => {
        if (!isMounted) return;
        setTeam(data.team);
        setMembers(Array.isArray(data?.members) ? data.members : []);
        setStatus('ready');
      })
      .catch((err) => {
        if (!isMounted) return;
        setStatus(err?.status === 404 ? 'not-found' : 'error');
      });

    return () => {
      isMounted = false;
    };
  }, [teamId, token, loadAttempt]);

  if (status === 'not-found') {
    return <Navigate to="/dashboard" replace />;
  }

  const openAssignModal = () => {
    setActionError('');
    setShowAssignModal(true);
    setIsLoadingAvailable(true);
    getAvailableDevelopersForTeam(teamId, token)
      .then((data) => {
        setAvailableDevelopers(Array.isArray(data?.developers) ? data.developers : []);
      })
      .catch((err) => {
        setActionError(err.message);
        setShowAssignModal(false);
      })
      .finally(() => {
        setIsLoadingAvailable(false);
      });
  };

  const handleAssign = (developerId) => {
    setIsSubmitting(true);
    addTeamMember(teamId, developerId, token)
      .then((data) => {
        setMembers(Array.isArray(data?.members) ? data.members : []);
        setShowAssignModal(false);
      })
      .catch((err) => {
        setActionError(err.message);
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleRemove = (userId) => {
    setActionError('');
    removeTeamMember(teamId, userId, token)
      .then((data) => {
        setMembers(Array.isArray(data?.members) ? data.members : []);
      })
      .catch((err) => {
        setActionError(err.message);
      });
  };

  return (
    <div className="admin-dashboard">
      <AdminSidebar />

      <main className="admin-dashboard__main">
        {status === 'loading' && <p className="dashboard-status" role="status">Loading team...</p>}

        {status === 'error' && (
          <div className="dashboard-status" role="alert">
            <p>Couldn&apos;t load this team.</p>
            <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && team && (
          <>
            <div className="team-detail__header">
              <h1>{team.name}</h1>
            </div>

            <section className="team-members-card">
              <div className="team-members-card__header">
                <div>
                  <h2>Team Members</h2>
                  <p>Manage which developers are on this team</p>
                </div>
                <button type="button" className="admin-btn admin-btn--solid" onClick={openAssignModal}>
                  + Assign Developer
                </button>
              </div>

              {actionError && (
                <p className="login-error login-error--server" role="alert">
                  {actionError}
                </p>
              )}

              <div className="team-members-table__columns">
                <span>Name</span>
                <span>Role</span>
                <span>Action</span>
              </div>

              <div className="team-members-table__body">
                {members.length === 0 && (
                  <p className="admin-modal__empty">No developers on this team yet.</p>
                )}
                {members.map((member) => (
                  <div className="team-members-table__row" key={member.id}>
                    <strong className="team-members-table__name">{member.name}</strong>
                    <span className="team-members-table__role">
                      {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                    </span>
                    <span className="team-members-table__action">
                      <button
                        type="button"
                        className="admin-remove-btn"
                        onClick={() => handleRemove(member.id)}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {showAssignModal && (
        <AssignDeveloperModal
          teamName={team?.name ?? 'this team'}
          developers={isLoadingAvailable ? [] : availableDevelopers}
          onAssign={handleAssign}
          onClose={() => setShowAssignModal(false)}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
