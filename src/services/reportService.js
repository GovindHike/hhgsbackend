import dayjs from "dayjs";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { Leave } from "../models/Leave.js";
import { sendEmail } from "./emailService.js";
import { dailyProjectStatusTemplate } from "../utils/emailTemplates.js";
import { ADMIN_ROLES, TEAM_LEAD_ROLES, EMPLOYEE_ROLES } from "../utils/constants.js";

const buildProjectSummary = (tasks) => {
  const grouped = new Map();

  tasks.forEach((task) => {
    const projectKey = task.projectName || task.assignedTo?.team?.name || "General";
    if (!grouped.has(projectKey)) {
      grouped.set(projectKey, []);
    }

    grouped.get(projectKey).push({
      employeeName: task.assignedTo?.name || "Unknown",
      title: task.title,
      status: task.status
    });
  });

  return [...grouped.entries()].map(([projectName, entries]) => ({
    projectName,
    employees: entries.reduce((acc, entry) => {
      const existing = acc.find((item) => item.employeeName === entry.employeeName);
      if (existing) {
        existing.tasks.push({ title: entry.title, status: entry.status });
      } else {
        acc.push({
          employeeName: entry.employeeName,
          tasks: [{ title: entry.title, status: entry.status }]
        });
      }
      return acc;
    }, [])
  }));
};

export const getDailyProjectStatusReportPayload = async () => {
  // Compute IST day boundaries without requiring dayjs plugins.
  // IST = UTC+5:30 (330 min). Shift "now" forward by 5h30m to get the IST
  // calendar date, derive midnight boundaries in that date, then shift back
  // to UTC so MongoDB comparisons are correct.
  const IST_OFFSET_MS = 330 * 60 * 1000; // 5h 30m in milliseconds
  const nowIST     = new Date(Date.now() + IST_OFFSET_MS);          // current moment expressed as IST
  const istDateStr = nowIST.toISOString().slice(0, 10);             // "YYYY-MM-DD" in IST
  const todayStart = new Date(new Date(`${istDateStr}T00:00:00.000Z`).getTime() - IST_OFFSET_MS); // IST 00:00 → UTC
  const todayEnd   = new Date(new Date(`${istDateStr}T23:59:59.999Z`).getTime() - IST_OFFSET_MS); // IST 23:59 → UTC

  const [tasks, leaves, employees, teamLeads, admins] = await Promise.all([
    Task.find({ taskDate: { $gte: todayStart, $lte: todayEnd } })
      .populate({
        path: "assignedTo",
        select: "name team",
        populate: { path: "team", select: "name" }
      })
      .lean(),
    Leave.find({
      status: { $in: ["Approved", "Pending"] },
      startDate: { $lte: todayEnd },
      endDate:   { $gte: todayStart }
    })
      .populate("user", "name")
      .lean(),
    User.find({ role: { $in: EMPLOYEE_ROLES }, isActive: true }).select("email").lean(),
    User.find({ role: { $in: TEAM_LEAD_ROLES }, isActive: true }).select("email").lean(),
    User.find({ role: { $in: ADMIN_ROLES }, isActive: true }).select("email").lean()
  ]);

  const projectSummary = buildProjectSummary(tasks);
  const taskSummary = {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === "Completed").length,
    pending: tasks.filter((task) => task.status !== "Completed").length
  };
  const toISTDateStr = (date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

  const leaveSummary = leaves.map((leave) => ({
    employeeName: leave.user?.name || "Unknown",
    leaveType: leave.requestedType || leave.finalType || "N/A",
    // Format dates in IST so the displayed date matches what the user selected
    leaveDuration: `${toISTDateStr(leave.startDate)} to ${toISTDateStr(leave.endDate)}`,
    leaveStatus: leave.status
  }));

  const mail = dailyProjectStatusTemplate({
    generatedAt: new Date(),
    projectSummary,
    taskSummary,
    leaveSummary
  });

  return {
    mail,
    recipients: {
      to: [...employees, ...teamLeads].map((user) => user.email),
      cc: admins.map((user) => user.email)
    },
    data: {
      projectSummary,
      taskSummary,
      leaveSummary
    }
  };
};

export const sendDailyProjectStatusReport = async () => {
  const { mail, recipients } = await getDailyProjectStatusReportPayload();

  await sendEmail({
    to: recipients.to.join(","),
    cc: recipients.cc.join(","),
    ...mail
  });
};
