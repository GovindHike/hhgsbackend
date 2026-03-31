import { connectDatabase } from "../config/database.js";
import { User } from "../models/User.js";
import { Team } from "../models/Team.js";
import { Asset } from "../models/Asset.js";
import { Task } from "../models/Task.js";
import { Leave } from "../models/Leave.js";
import { Attendance } from "../models/Attendance.js";
import { ROLES } from "../utils/constants.js";

const run = async () => {
  await connectDatabase();
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Asset.deleteMany({}),
    Task.deleteMany({}),
    Leave.deleteMany({}),
    Attendance.deleteMany({})
  ]);

  const admin = await User.create({
    name: "System Admin",
    email: "admin@office.local",
    password: "Admin@123",
    role: ROLES.MANAGING_DIRECTOR,
    employeeCode: "EMP-001",
    isFirstLogin: false
  });

  const lead = await User.create({
    name: "Priya Sharma",
    email: "lead@office.local",
    password: "Lead@123",
    role: ROLES.TECHNICAL_LEAD,
    employeeCode: "EMP-002",
    isFirstLogin: false
  });

  const director = await User.create({
    name: "Director User",
    email: "director@office.local",
    password: "Director@123",
    role: ROLES.DIRECTOR,
    employeeCode: "EMP-004",
    isFirstLogin: false
  });

  const managingDirector = await User.create({
    name: "Managing Director",
    email: "managingdirector@office.local",
    password: "MD@123",
    role: ROLES.MANAGING_DIRECTOR,
    employeeCode: "EMP-005",
    isFirstLogin: false
  });

  const hrAdmin = await User.create({
    name: "HR Administrator",
    email: "hradmin@office.local",
    password: "HR@123",
    role: ROLES.HR_ADMIN,
    employeeCode: "EMP-006",
    isFirstLogin: false
  });

  const financeAdmin = await User.create({
    name: "Finance Admin",
    email: "financeadmin@office.local",
    password: "Finance@123",
    role: ROLES.FINANCE_ADMIN,
    employeeCode: "EMP-007",
    isFirstLogin: false
  });

  const clientDo = await User.create({
    name: "Director of Operations",
    email: "do@office.local",
    password: "DO@123",
    role: ROLES.DO,
    employeeCode: "EMP-008",
    isFirstLogin: false
  });

  const employee = await User.create({
    name: "Rahul Singh",
    email: "employee@office.local",
    password: "Employee@123",
    role: ROLES.SOFTWARE_ENGINEER,
    employeeCode: "EMP-003",
    isFirstLogin: false
  });

  const team = await Team.create({
    name: "Product Engineering",
    description: "Application delivery team",
    lead: lead._id,
    members: [lead._id, employee._id]
  });

  await User.updateMany({ _id: { $in: [lead._id, employee._id] } }, { $set: { team: team._id } });

  await Asset.create({
    name: "Dell Latitude 7440",
    type: "Laptop",
    uniqueAssetId: "AST-00001",
    assignedTo: employee._id,
    status: "Assigned",
    history: [{ assignedTo: employee._id, assignedBy: admin._id, note: "Initial assignment" }]
  });

  await Task.create({
    title: "Prepare sprint summary",
    description: "Compile completed stories and blockers",
    projectName: "Delivery Operations",
    assignedTo: employee._id,
    assignedBy: lead._id,
    status: "In Progress"
  });

  await Leave.create({
    user: employee._id,
    team: team._id,
    startDate: new Date(),
    endDate: new Date(),
    leaveType: "Full Day",
    reason: "Medical appointment",
    status: "Pending"
  });

  console.log("Seed data created");
  process.exit(0);
};

run();
