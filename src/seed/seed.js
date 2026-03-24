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
    role: ROLES.ADMIN,
    employeeCode: "EMP-001",
    isFirstLogin: false
  });

  const lead = await User.create({
    name: "Priya Sharma",
    email: "lead@office.local",
    password: "Lead@123",
    role: ROLES.TEAM_LEAD,
    employeeCode: "EMP-002",
    isFirstLogin: false
  });

  const employee = await User.create({
    name: "Rahul Singh",
    email: "employee@office.local",
    password: "Employee@123",
    role: ROLES.EMPLOYEE,
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
