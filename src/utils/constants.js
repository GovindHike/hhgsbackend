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

export const TASK_STATUSES = ["Backlog", "Ready", "In Progress", "QA Needed", "Completed"];
export const TASK_CATEGORIES = ["Bug/Issue", "Enhancement", "Feature"];
export const LEAVE_STATUSES = ["Pending", "Approved", "Rejected", "Cancelled"];
export const ASSET_STATUSES = ["Available", "Assigned", "Maintenance", "Repair", "Retired"];
export const ASSET_CATEGORIES = ["Computer and Accessories", "Furniture and Equipment"];
export const ASSET_SUBCATEGORIES = {
  "Computer and Accessories": [
    "Laptop",
    "Desktop",
    "Monitor",
    "Keyboard",
    "Mouse",
    "Printer",
    "Scanner",
    "UPS",
    "Router",
    "Switch",
    "Headset",
    "Webcam",
    "Hard Disk",
    "Pen Drive",
    "Cables & Adapters",
    "Mobile Phone",
    "Projector"
  ],
  "Furniture and Equipment": [
    "Furnishing and Fixtures",
    "Office Furniture",
    "Electrical Appliances and Office Equipment"
  ]
};

export const ASSET_AUDIT_ACTIONS = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "ASSIGN",
  "UNASSIGN",
  "COMPLAINT",
  "MOVEMENT"
];

export const SHIFT_TYPES = ["Shift 1", "Shift 2"];

export const IDLE_THRESHOLD_MINUTES = 10;

/** Field types a statutory register column can be configured as. */
export const REGISTER_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "currency",
  "date",
  "time",
  "select",
  "multiselect",
  "boolean",
  "email",
  "phone",
  "employee"
];
