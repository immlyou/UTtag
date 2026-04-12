/**
 * Email Service Module
 * Handles email delivery using Resend API
 */

const { Resend } = require("resend");

// Initialize Resend client
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const REPORT_NAMES = {
  temperature_excursion: "Temperature Excursion Report",
  geofence_events: "Geofence Event Report",
  task_completion: "Task Completion Report",
  haccp_compliance: "HACCP Compliance Report",
  batch_traceability: "Batch Traceability Report"
};

const REPORT_NAMES_ZH = {
  temperature_excursion: "Temperature Excursion Report",
  geofence_events: "Geofence Event Report",
  task_completion: "Task Completion Report",
  haccp_compliance: "HACCP Compliance Report",
  batch_traceability: "Batch Traceability Report"
};

/**
 * Send report email with PDF attachment
 * @param {object} params - Email parameters
 * @param {string} params.to - Recipient email
 * @param {string} params.name - Recipient name
 * @param {string} params.reportType - Type of report
 * @param {string} params.reportName - Schedule name
 * @param {object} params.reportData - Report data for summary
 * @param {Buffer} params.pdfBuffer - PDF attachment buffer
 */
async function sendReportEmail({ to, name, reportType, reportName, reportData, pdfBuffer }) {
  if (!resend) {
    console.warn("[Email] Resend API key not configured, skipping email");
    throw new Error("Email service not configured");
  }

  const reportTitle = REPORT_NAMES[reportType] || "Report";
  const reportTitleZh = REPORT_NAMES_ZH[reportType] || "";
  const summary = reportData.summary || {};

  // Build summary HTML based on report type
  let summaryHtml = "";
  switch (reportType) {
    case "temperature_excursion":
      summaryHtml = `
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Tags Monitored</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.total_tags_monitored || 0}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Excursion Events</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.total_excursion_events || 0}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Critical Events</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: ${summary.critical_events > 0 ? '#dc2626' : '#22c55e'};">${summary.critical_events || 0}</td></tr>
      `;
      break;
    case "geofence_events":
      summaryHtml = `
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Total Events</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.total_events || 0}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Entry Events</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.entry_events || 0}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Exit Events</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.exit_events || 0}</td></tr>
      `;
      break;
    case "task_completion":
      summaryHtml = `
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Total Tasks</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.total_tasks || 0}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Completed</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: #22c55e;">${summary.completed_tasks || 0}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Completion Rate</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.completion_rate || 0}%</td></tr>
      `;
      break;
    case "haccp_compliance":
      const complianceColor = (summary.compliance_rate || 0) >= 95 ? '#22c55e' : (summary.compliance_rate || 0) >= 80 ? '#f59e0b' : '#dc2626';
      summaryHtml = `
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">CCPs Monitored</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${summary.total_ccps_monitored || 0}</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Compliance Rate</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: ${complianceColor};">${summary.compliance_rate || 0}%</td></tr>
        <tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">Deviations</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: ${summary.total_deviations > 0 ? '#dc2626' : '#22c55e'};">${summary.total_deviations || 0}</td></tr>
      `;
      break;
    default:
      // Generic summary
      Object.entries(summary).forEach(([key, value]) => {
        if (typeof value !== "object") {
          const label = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
          summaryHtml += `<tr><td style="padding: 10px; border-bottom: 1px solid #e5e7eb;">${label}</td><td style="padding: 10px; border-bottom: 1px solid #e5e7eb; font-weight: 600;">${value}</td></tr>`;
        }
      });
  }

  const periodStart = reportData.period?.start?.substring(0, 10) || "";
  const periodEnd = reportData.period?.end?.substring(0, 10) || "";
  const dateStr = new Date().toISOString().substring(0, 10);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
      <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">UTtag</h1>
      <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Automated Report System</p>
    </div>

    <!-- Content -->
    <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      <h2 style="color: #1e3a8a; margin: 0 0 8px 0; font-size: 20px;">${reportTitle}</h2>
      ${reportTitleZh ? `<p style="color: #6b7280; margin: 0 0 4px 0; font-size: 13px;">${reportTitleZh}</p>` : ""}
      <p style="color: #374151; margin: 0 0 20px 0;"><strong>${reportName}</strong></p>

      <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 13px;">
        Report Period: ${periodStart} to ${periodEnd}
      </p>

      <!-- Summary Table -->
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f9fafb;">
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Metric</th>
            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Value</th>
          </tr>
        </thead>
        <tbody>
          ${summaryHtml}
        </tbody>
      </table>

      <p style="color: #6b7280; margin: 20px 0; font-size: 13px;">
        Please see the attached PDF for detailed information.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.APP_URL || 'https://uttag.example.com'}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6, #6366f1); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">View Dashboard</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; font-size: 12px; color: #6b7280;">
      <p style="margin: 0 0 8px 0;">This is an automated report. Please do not reply.</p>
      <p style="margin: 0;">
        <a href="${process.env.APP_URL || 'https://uttag.example.com'}/schedules" style="color: #3b82f6; text-decoration: none;">Manage Report Schedules</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;

  const attachments = pdfBuffer ? [{
    filename: `${reportType}_${dateStr}.pdf`,
    content: pdfBuffer.toString("base64")
  }] : [];

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "UTtag <reports@uttag.example.com>",
    to: [to],
    subject: `[UTtag] ${reportTitle} - ${dateStr}`,
    html,
    attachments
  });

  if (error) {
    console.error("[Email] Failed to send:", error);
    throw new Error(error.message);
  }

  console.log(`[Email] Sent report to ${to}`);
  return { success: true };
}

/**
 * Send a simple notification email
 * @param {object} params - Email parameters
 */
async function sendNotificationEmail({ to, subject, message }) {
  if (!resend) {
    console.warn("[Email] Resend API key not configured, skipping email");
    throw new Error("Email service not configured");
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px;">
  <div style="max-width: 500px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px;">
    <h2 style="color: #1e40af; margin: 0 0 16px;">UTtag Notification</h2>
    <p style="color: #374151; line-height: 1.6;">${message}</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="color: #9ca3af; font-size: 12px; margin: 0;">This is an automated notification from UTtag.</p>
  </div>
</body>
</html>
  `;

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "UTtag <noreply@uttag.example.com>",
    to: [to],
    subject,
    html
  });

  if (error) throw new Error(error.message);
  return { success: true };
}

module.exports = { sendReportEmail, sendNotificationEmail };
