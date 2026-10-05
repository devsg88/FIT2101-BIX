import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import AdminSidebar from '../components/dashboard/AdminSidebar.jsx';
import { allDevelopers, allTeams, developerIdsByTeam } from '../data/orgMockData.js';

// Handles the logic for the assign developer popup
function AssignDeveloperModal({ team, currentDeveloperIds, onAssign, onClose }) {
  
  // stores the developer name searched for by the admin
  const [searchQuery, setSearchQuery] = useState('');
  // stores the developer clicked by the admin
  const [selectedDeveloperId, setSelectedDeveloperId] = useState(null);

  // find which developers are already assigned to another team 
  // allows the popup to show them as unavailable 
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

  // Creates the list of developer rows inside the assign developers popup
  const candidates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    
    // start with the full developers list
    return allDevelopers
      .filter((developer) => !currentDeveloperIds.has(developer.id)) 
      .filter( //
        (developer) =>
          !query ||
          developer.name.toLowerCase().includes(query) ||
          developer.email.toLowerCase().includes(query)
      );
  }, [searchQuery, currentDeveloperIds]);

  // handleSubmit runs when admin presses the assign button after selecting a developer
  const handleSubmit = (event) => {
    event.preventDefault();

    // search for the selected developer object from allDevelopers
    const developer = allDevelopers.find((d) => d.id === selectedDeveloperId);
    if (!developer) {
      return;
    }

    // adds the selected developer as a new member row in the team members list
    onAssign(developer);
  };

  // UI for assign developer popup
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

            {/* loop through each developer */}
            {candidates.map((developer) => {
              const isElsewhere = elsewhereDeveloperIds.has(developer.id);
              const isSelected = selectedDeveloperId === developer.id;

              return (
                // each developer is a clickable button
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
  
  // read team id from URL
  const { teamId } = useParams();
  // find the corresponding team object from allTeams
  const team = useMemo(() => allTeams.find((t) => String(t.id) === teamId), [teamId]);

  // Current displayed team member list
  const [members, setMembers] = useState(team ? team.members : []);
  // Control whether the popup is visible
  const [showAssignModal, setShowAssignModal] = useState(false);

  // Handle switching from one team to another 
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

  // Handle developer assignment
  // Take existing team members -> add the selected developer as new member
  // -> update the page and close the popup
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

  // Handle developer removal
  // Creates new member list containing everyone but the developer whose remove
  // button was clicked
  const handleRemove = (memberId) => {
    setMembers((prev) => prev.filter((member) => member.id !== memberId));
  };

  return (
    <div className="admin-dashboard">
      <AdminSidebar />

      <main className="admin-dashboard__main">
        <div className="team-detail__header">
          {/* show sidebar with different teams */}
          <h1>{team.name}</h1>
          <p className="team-detail__project">Current Project: {team.currentProject}</p>
          <span className={`admin-status-pill admin-status-pill--${team.statusType}`}>{team.status}</span>
          {/* Admin route into the board (US-04a): Link keeps the in-memory
              login, a plain <a href> would reload the page and log out. */}
          {team.projectId != null && (
            <Link
              to={`/projects/${team.projectId}/board`}
              className="admin-btn admin-btn--solid team-detail__board-link"
            >
              View Board
            </Link>
          )}
        </div>

        <section className="team-members-card">
          <div className="team-members-card__header">
            <div>
              <h2>Team Members</h2>
              <p>Manage team members and their roles for this project</p>
            </div>
            {/* Assign developer button */}
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
            {/* show the selected team's information */}
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

      {/* if showAssignModal is true, render AssignDeveloperModal, otherwise dont render anything */}
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
