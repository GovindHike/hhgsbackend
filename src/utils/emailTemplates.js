const APP_URL = "https://hhgsportal.netlify.app";
const COMPANY_NAME = "HHGS";
const BRAND_COLOR = "#4f46e5";
const BRAND_DARK = "#172033";

const emailWrapper = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${COMPANY_NAME} Portal</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:${BRAND_COLOR};padding:28px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${COMPANY_NAME} Office Portal</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 40px;color:${BRAND_DARK};line-height:1.7;font-size:15px;">
              ${content}
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:13px;color:#64748b;">This is an automated message from <strong>${COMPANY_NAME} Office Portal</strong>.</p>
              <p style="margin:0;font-size:13px;color:#94a3b8;">If you have questions, contact your HR administrator.</p>
              <p style="margin:8px 0 0;">
                <a href="${APP_URL}" style="color:${BRAND_COLOR};font-size:13px;text-decoration:none;">Visit the Portal &rarr;</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const loginButton = () => `
  <div style="text-align:center;margin:28px 0;">
    <a href="${APP_URL}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;letter-spacing:0.3px;">
      Login to Portal
    </a>
  </div>
`;

const credentialBox = ({ email, password }) => `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px 24px;margin:20px 0;">
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#64748b;width:150px;">Email Address</td>
        <td style="padding:6px 0;font-size:14px;color:${BRAND_DARK};font-weight:600;">${email}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#64748b;">Temporary Password</td>
        <td style="padding:6px 0;font-size:14px;color:${BRAND_DARK};font-weight:600;font-family:monospace;letter-spacing:1px;">${password}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#64748b;">Portal URL</td>
        <td style="padding:6px 0;font-size:14px;">
          <a href="${APP_URL}" style="color:${BRAND_COLOR};text-decoration:none;">${APP_URL}</a>
        </td>
      </tr>
    </table>
  </div>
`;

export const firstTimePasswordTemplate = ({ name, email, password }) => ({
  subject: `Welcome to ${COMPANY_NAME} Office Portal — Your Account is Ready`,
  html: emailWrapper(`
    <p style="margin:0 0 16px;">Hello <strong>${name}</strong>,</p>
    <p style="margin:0 0 16px;">
      Welcome aboard! Your employee account on the <strong>${COMPANY_NAME} Office Portal</strong> has been created successfully.
      Use the credentials below to sign in for the first time.
    </p>
    ${credentialBox({ email, password })}
    <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:20px 0;">
      <p style="margin:0;font-size:14px;color:#92400e;">
        <strong>Important:</strong> You will be required to set a new password upon your first login. Do not share your temporary password with anyone.
      </p>
    </div>
    ${loginButton()}
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">
      If you did not expect this email, please contact your HR administrator immediately.
    </p>
  `)
});

export const forgotPasswordTemplate = ({ name, email, password }) => ({
  subject: `${COMPANY_NAME} Portal — Password Reset`,
  html: emailWrapper(`
    <p style="margin:0 0 16px;">Hi <strong>${name || "there"}</strong>,</p>
    <p style="margin:0 0 16px;">
      We received a request to reset your <strong>${COMPANY_NAME} Office Portal</strong> account password.
      A temporary password has been generated for you.
    </p>
    ${credentialBox({ email, password })}
    <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:20px 0;">
      <p style="margin:0;font-size:14px;color:#92400e;">
        <strong>Security Notice:</strong> You will be prompted to set a new password immediately after signing in. This temporary password expires upon first use.
      </p>
    </div>
    ${loginButton()}
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">
      If you did not request a password reset, please ignore this email — your account remains secure.
    </p>
  `)
});

export const broadcastTemplate = ({ subject, body }) => ({
  subject,
  html: emailWrapper(`
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:${BRAND_DARK};">Announcement from ${COMPANY_NAME}</p>
    <div style="margin:20px 0;padding:20px 24px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;font-size:15px;color:${BRAND_DARK};line-height:1.8;">
      ${body.replace(/\n/g, "<br/>")}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="${APP_URL}" style="color:${BRAND_COLOR};font-size:14px;text-decoration:none;font-weight:500;">
        Open ${COMPANY_NAME} Portal &rarr;
      </a>
    </div>
  `)
});

export const dailyProjectStatusTemplate = ({ generatedAt, projectSummary, taskSummary, leaveSummary }) => ({
  subject: `${COMPANY_NAME} — Daily Project Status Report`,
  html: emailWrapper(`
    <p style="margin:0 0 4px;font-size:16px;font-weight:600;color:${BRAND_DARK};">Daily Project Status Report</p>
    <p style="margin:0 0 24px;font-size:13px;color:#64748b;">Generated on ${new Date(generatedAt).toLocaleString()}</p>

    <h3 style="margin:0 0 12px;font-size:15px;color:${BRAND_DARK};border-bottom:2px solid #e2e8f0;padding-bottom:8px;">1. Team Availability</h3>
    ${leaveSummary.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e2e8f0;color:#475569;">Employee</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e2e8f0;color:#475569;">Leave Type</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e2e8f0;color:#475569;">Status</th>
            <th style="text-align:left;padding:10px 12px;border-bottom:2px solid #e2e8f0;color:#475569;">Date Range</th>
          </tr>
        </thead>
        <tbody>
          ${leaveSummary.map((leave, i) => `
            <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f8fafc"};">
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${leave.employeeName}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${leave.leaveType}</td>
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">
                <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${leave.leaveStatus === "Approved" ? "#dcfce7" : "#fef9c3"};color:${leave.leaveStatus === "Approved" ? "#166534" : "#854d0e"};">${leave.leaveStatus}</span>
              </td>
              <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${leave.leaveDuration}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : `<p style="color:#64748b;font-size:14px;margin-bottom:24px;">No team leave requests for today.</p>`}

    <h3 style="margin:0 0 12px;font-size:15px;color:${BRAND_DARK};border-bottom:2px solid #e2e8f0;padding-bottom:8px;">2. Project Summary</h3>
    ${projectSummary.length > 0 ? projectSummary.map((project) => `
      <div style="margin-bottom:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <div style="background:#f8fafc;padding:10px 16px;border-bottom:1px solid #e2e8f0;">
          <strong style="font-size:14px;color:${BRAND_DARK};">${project.projectName}</strong>
        </div>
        <div style="padding:12px 16px;">
          ${project.employees.map((employee) => `
            <div style="margin-bottom:10px;">
              <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#334155;">${employee.employeeName}</p>
              <ul style="margin:0;padding-left:20px;">
                ${employee.tasks.map((task) => `
                  <li style="font-size:13px;color:#475569;padding:2px 0;">
                    ${task.title}
                    <span style="display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;margin-left:6px;background:${task.status === "Completed" ? "#dcfce7" : task.status === "In Progress" ? "#dbeafe" : "#f1f5f9"};color:${task.status === "Completed" ? "#166534" : task.status === "In Progress" ? "#1d4ed8" : "#475569"};">
                      ${task.status}
                    </span>
                  </li>
                `).join("")}
              </ul>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("") : `<p style="color:#64748b;font-size:14px;">No project tasks recorded for today.</p>`}

    <div style="text-align:center;margin-top:28px;">
      <a href="${APP_URL}" style="color:${BRAND_COLOR};font-size:14px;text-decoration:none;font-weight:500;">
        View Full Report on Portal &rarr;
      </a>
    </div>
  `)
});
