import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import AdminSidebar from '../components/dashboard/AdminSidebar.jsx';
import { allDevelopers, allTeams, developerIdsByTeam } from '../data/orgMockData.js';

// "+ Assign Developer": search the global developer directory, pick one not
// already on another team, click to select, then confirm with Assign.
// Developers already on *this* team are left out entirely (nothing to do);
// developers on some other team are shown but disabled, tagged "Assigned
// elsewhere" instead of "Available", so it's clear why they can't be picked.
function AssignDeveloperModal({ team, currentDeveloperIds, onAssign, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeveloperId, setSelectedDeveloperId] = useState(null);

  const elsewhereDeveloperIds = useMemo(() => {
    const byTeam = developerIdsByTeam();
    const elsewhere = new Set();
    for (const [otherTeamId, developerIds] of byTeam) {
      if (otherTeamId === team.id) {
        continue;
      }
      for (const id of developerIds) {
        elsewhere.add(id);
      }
    }
    return elsewhere;
  }, [team.id]);

  const candidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return allDevelopers
      .filter((developer) => !currentDeveloperIds.has(developer.id))
      .filter(
        (developer) =>
          !query ||
          developer.name.toLowerCase().includes(query) ||
          developer.email.toLowerCase().includes(query)
      );
  }, [searchQuery, currentDeveloperIds]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const developer = allDevelopers.find((d) => d.id === selectedDeveloperId);
    if (!developer) {
      return;
    }
    onAssign(developer);
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

        <p className="admin-modal__subtitle">
          Select a developer to assign to {team.name} ({team.currentProject})
        </p>

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
              const isElsewhere = elsewhereDeveloperIds.has(developer.id);
              const isSelected = selectedDeveloperId === developer.id;

              return (
                <button
                  type="button"
                  key={developer.id}
                  className={`admin-modal__row ${isSelected ? 'admin-modal__row--selected' : ''}`}
                  disabled={isElsewhere}
                  onClick={() => setSelectedDeveloperId(developer.id)}
                >
                  <span className="admin-modal__row-info">
                    <strong>{developer.name}</strong>
                    <span className="admin-modal__row-email">{developer.email}</span>
                  </span>
                  <span
                    className={`admin-status-pill ${
                      isElsewhere ? 'admin-status-pill--blocked' : 'admin-status-pill--active'
                    }`}
                  >
                    {isElsewhere ? 'Assigned elsewhere' : 'Available'}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="admin-modal__actions">
            <button type="button" className="admin-btn admin-btn--filter" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-btn admin-btn--solid" disabled={!selectedDeveloperId}>
              Assign
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamDetail() {
  const { teamId } = useParams();
  const team = useMemo(() => allTeams.find((t) => String(t.id) === teamId), [teamId]);

  // Members list is local component state seeded from the mock team, the
  // same "client-side only, no backend yet" pattern the rest of the admin
  // dashboard already uses. Declared before the not-found check below so
  // hook order never depends on whether `team` was found.
  const [members, setMembers] = useState(team ? team.members : []);
  const [showAssignModal, setShowAssignModal] = useState(false);

  // The route stays on the same TeamDetail instance when you go from one
  // team's page straight to another's (only :teamId changes) - React Router
  // does not remount the component just because a param changed. Without
  // this, `members` above keeps whatever the *first* team it rendered for
  // seeded it with, so every later team's page showed that team's roster
  // instead of its own. Re-seeding here on every teamId change is what
  // actually keeps the members table (and the assign modal, closed so it
  // can't apply to the wrong team) in sync with whichever team is on screen.
  useEffect(() => {
    setMembers(team ? team.members : []);
    setShowAssignModal(false);
  }, [teamId]);

  if (!team) {
    return <Navigate to="/dashboard" replace />;
  }

  const currentDeveloperIds = new Set(
    members.filter((member) => member.developerId != null).map((member) => member.developerId)
  );

  const handleAssign = (developer) => {
    setMembers((prev) => [
      ...prev,
      {
        id: `${team.id}-${developer.id}`,
        name: developer.name,
        role: 'Developer',
        status: 'Active',
        removable: true,
        developerId: developer.id
      }
    ]);
    setShowAssignModal(false);
  };

  const handleRemove = (memberId) => {
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
  };

  return (
    <div className="admin-dashboard">
      <AdminSidebar />

      <main className="admin-dashboard__main">
        <div className="team-detail__header">
          <h1>{team.name}</h1>
          <p className="team-detail__project">Current Project: {team.currentProject}</p>
          <span className={`admin-status-pill admin-status-pill--${team.statusType}`}>{team.status}</span>
        </div>

        <section className="team-members-card">
          <div className="team-members-card__header">
            <div>
              <h2>Team Members</h2>
              <p>Manage team members and their roles for this project</p>
            </div>
            <button
              type="button"
              className="admin-btn admin-btn--solid"
              onClick={() => setShowAssignModal(true)}
            >
              + Assign Developer
            </button>
          </div>

          <div className="team-members-table__columns">
            <span>Name</span>
            <span>Role</span>
            <span>Status</span>
            <span>Action</span>
            <span />
          </div>

          <div className="team-members-table__body">
            {members.map((member) => (
              <div className="team-members-table__row" key={member.id}>
                <strong className="team-members-table__name">{member.name}</strong>
                <span className="team-members-table__role">{member.role}</span>
                <span className="admin-status-pill admin-status-pill--active">{member.status}</span>
                <span className="team-members-table__action">
                  {member.removable && (
                    <button
                      type="button"
                      className="admin-remove-btn"
                      onClick={() => handleRemove(member.id)}
                    >
                      Remove
                    </button>
                  )}
                </span>
                <button
                  type="button"
                  className="team-health-table__menu"
                  aria-label={`More actions for ${member.name}`}
                >
                  •••
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>

      {showAssignModal && (
        <AssignDeveloperModal
          team={team}
          currentDeveloperIds={currentDeveloperIds}
          onAssign={handleAssign}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}
