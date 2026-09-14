// Mock organization/team data shared by the admin "Organization Overview" page
// (AdminDashboard.jsx) and the per-team page (TeamDetail.jsx), so both views
// read the same teams instead of keeping two copies that could drift apart.
// Stands in for a real teams/team-members API, same as the mock arrays in
// DeveloperDashboard.jsx / MyProjects.jsx until one exists.

// The assignable developer pool for "+ Assign Developer" (Team Detail page).
// A team member built from one of these carries `developerId` pointing back
// here, so the assign modal can tell "already on another team" apart from
// "actually available" by id, not by matching on a display name.
export const allDevelopers = [
  { id: 101, name: 'David Kim', email: 'david.kim@bix.com' },
  { id: 102, name: 'Sarah Lim', email: 'sarah.lim@bix.com' },
  { id: 103, name: 'Alex Chen', email: 'alex.chen@bix.com' },
  { id: 104, name: 'Riya Patel', email: 'riya.patel@bix.com' },
  { id: 105, name: 'Omar Farouk', email: 'omar.farouk@bix.com' }
];

export const allTeams = [
  {
    id: 1,
    name: 'Team Alpha',
    currentProject: 'Auth Module Upgrade',
    status: 'On Track',
    statusType: 'on-track',
    sprintProgress: 70,
    members: [
      { id: 1, name: 'John', role: 'Product Owner', status: 'Active', removable: false },
      { id: 2, name: 'Jared', role: 'Developer', status: 'Active', removable: true },
      { id: 3, name: 'Jane', role: 'Developer', status: 'Active', removable: true }
    ]
  },
  {
    id: 2,
    name: 'Team Bravo',
    currentProject: 'Database Migration',
    status: 'Blocked',
    statusType: 'blocked',
    sprintProgress: 25,
    members: [
      { id: 4, name: 'Priya', role: 'Product Owner', status: 'Active', removable: false },
      { id: 5, name: 'Tom', role: 'Developer', status: 'Active', removable: true },
      // From the assignable pool, so Team Alpha's "Assign Developer" modal
      // shows Sarah Lim as "Assigned elsewhere" rather than "Available".
      {
        id: 102,
        name: 'Sarah Lim',
        role: 'Developer',
        status: 'Active',
        removable: true,
        developerId: 102
      }
    ]
  },
  {
    id: 3,
    name: 'Team Charlie',
    currentProject: 'Frontend Dashboard',
    status: 'On Track',
    statusType: 'on-track',
    sprintProgress: 90,
    members: [
      { id: 6, name: 'Adam', role: 'Product Owner', status: 'Active', removable: false },
      { id: 7, name: 'Nina', role: 'Developer', status: 'Active', removable: true }
    ]
  },
  {
    id: 4,
    name: 'Team Delta',
    currentProject: 'Reporting API',
    status: 'On Track',
    statusType: 'on-track',
    sprintProgress: 45,
    members: [{ id: 8, name: 'Wei', role: 'Product Owner', status: 'Active', removable: false }]
  }
];

// Derives the "@Name" the Team Health table shows for a team's Product Owner,
// from that team's own member list, so the two can't say different names.
export function productOwnerHandle(team) {
  const owner = team.members.find((member) => member.role === 'Product Owner');
  return owner ? `@${owner.name}` : '-';
}

export const orgStats = {
  activeSprintTeams: 18,
  totalTeams: 24,
  tasksInProgress: 142,
  teamsAtRisk: 2
};

// The developer ids already on some team, keyed by that team's id. Used by
// the Assign Developer modal to tell "available" apart from "assigned
// elsewhere" - see TeamDetail.jsx. Only reflects this module's static seed
// data, not any assign/remove happening in another already-open TeamDetail
// page in the same session: there is no shared/global membership state yet,
// each page's member list is local component state seeded from here.
export function developerIdsByTeam() {
  const map = new Map();
  for (const team of allTeams) {
    map.set(
      team.id,
      new Set(team.members.filter((member) => member.developerId != null).map((member) => member.developerId))
    );
  }
  return map;
}
