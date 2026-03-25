import dayjs from "dayjs";
import { User } from "../models/User.js";
import { Task } from "../models/Task.js";
import { Leave } from "../models/Leave.js";
import { sendEmail } from "./emailService.js";
import { dailyProjectStatusTemplate } from "../utils/emailTemplates.js";

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
  const todayStart = dayjs().startOf("day").toDate();
  const todayEnd = dayjs().endOf("day").toDate();
  const [tasks, leaves, employees, teamLeads, admins] = await Promise.all([
    Task.find({ taskDate: { $gte: todayStart, $lte: todayEnd } })
      .populate({
        path: "assignedTo",
        select: "name team",
        populate: { path: "team", select: "name" }
      })
      .lean(),
    Leave.find({ status: { $in: ["Approved", "Pending"] }, endDate: { $gte: dayjs().startOf("day").toDate() } })
      .populate("user", "name")
      .lean(),
    User.find({ role: "Employee", isActive: true }).select("email").lean(),
    User.find({ role: "Team Lead", isActive: true }).select("email").lean(),
    User.find({ role: "Admin", isActive: true }).select("email").lean()
  ]);

  const projectSummary = buildProjectSummary(tasks);
  const taskSummary = {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === "Completed").length,
    pending: tasks.filter((task) => task.status !== "Completed").length
  };
  const leaveSummary = leaves.map((leave) => ({
    employeeName: leave.user?.name || "Unknown",
    leaveType: leave.leaveType,
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
