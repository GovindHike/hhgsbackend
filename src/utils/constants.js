export const ROLES = {
  DIRECTOR: "Director",
  MANAGING_DIRECTOR: "Managing Director",
  DO: "Director of operations",
  HR_ADMIN: "HR Administrator",
  FINANCE_ADMIN: "Finance & Admin",
  TECHNICAL_LEAD: "Technical Lead",
  QA_LEAD: "QA Lead",
  SENIOR_SOFTWARE_ENGINEER: "Senior Software Engineer",
  SOFTWARE_ENGINEER: "Software Engineer"
};

export const ADMIN_ROLES = [
  ROLES.DIRECTOR,
  ROLES.MANAGING_DIRECTOR,
  ROLES.DO,
  ROLES.HR_ADMIN,
  ROLES.FINANCE_ADMIN
];

export const TEAM_LEAD_ROLES = [ROLES.TECHNICAL_LEAD, ROLES.QA_LEAD];
export const EMPLOYEE_ROLES = [ROLES.SENIOR_SOFTWARE_ENGINEER, ROLES.SOFTWARE_ENGINEER];
export const ALL_ROLES = [...ADMIN_ROLES, ...TEAM_LEAD_ROLES, ...EMPLOYEE_ROLES];

export const isAdminRole = (role = "") => ADMIN_ROLES.includes(role);
export const isTeamLeadRole = (role = "") => TEAM_LEAD_ROLES.includes(role);
export const isEmployeeRole = (role = "") => EMPLOYEE_ROLES.includes(role);

export const TASK_STATUSES = ["Pending", "In Progress", "Completed"];
export const LEAVE_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"];
export const ASSET_STATUSES = ["Available", "Assigned", "Maintenance", "Retired"];

export const SHIFT_TYPES = ["Shift 1", "Shift 2"];
