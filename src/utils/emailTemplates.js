export const firstTimePasswordTemplate = ({ name, email, password }) => ({
  subject: "Your Office Management account",
  html: `
    <p>Hello ${name},</p>
    <p>Your account has been created for the Office Management application.</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Temporary Password:</strong> ${password}</p>
    <p>Please log in and change your password immediately.</p>
  `
});

export const broadcastTemplate = ({ subject, body }) => ({
  subject,
  html: `<p>${body.replace(/\n/g, "<br/>")}</p>`
});

export const dailyProjectStatusTemplate = ({ generatedAt, projectSummary, taskSummary, leaveSummary }) => ({
  subject: "Daily Project Status Report",
  html: `
    <div style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">
      <h2 style="margin-bottom: 4px;">Daily Project Status Report</h2>
      <p style="color: #64748b; margin-top: 0;">Generated on ${new Date(generatedAt).toLocaleString()}</p>

      <h3>1. Project Summary</h3>
      ${projectSummary
        .map(
          (project) => `
            <div style="margin-bottom: 16px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 10px;">
              <strong>${project.projectName}</strong>
              <ul>
                ${project.employees
                  .map(
                    (employee) => `
                      <li>
                        <strong>${employee.employeeName}</strong>
                        <ul>
                          ${employee.tasks.map((task) => `<li>${task.title} - ${task.status}</li>`).join("")}
                        </ul>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
            </div>
          `
        )
        .join("")}

      <h3>2. Task Summary</h3>
      <p>Total tasks: <strong>${taskSummary.total}</strong></p>
      <p>Completed tasks: <strong>${taskSummary.completed}</strong></p>
      <p>Pending tasks: <strong>${taskSummary.pending}</strong></p>

      <h3>3. Leave Summary</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0;">Employee</th>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0;">Leave Type</th>
            <th style="text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0;">Leave Status</th>
          </tr>
        </thead>
        <tbody>
          ${leaveSummary
            .map(
              (leave) => `
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${leave.employeeName}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${leave.leaveType}</td>
                  <td style="padding: 8px; border-bottom: 1px solid #f1f5f9;">${leave.leaveStatus}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `
});
