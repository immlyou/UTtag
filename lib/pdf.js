/**
 * PDF Generator Module
 * Creates PDF reports using PDFKit
 */

const PDFDocument = require("pdfkit");
const { DateTime } = require("luxon");

const REPORT_TITLES = {
  temperature_excursion: "Temperature Excursion Report",
  geofence_events: "Geofence Event Report",
  task_completion: "Task Completion Report",
  haccp_compliance: "HACCP Compliance Report",
  batch_traceability: "Batch Traceability Report"
};

const REPORT_TITLES_ZH = {
  temperature_excursion: "Temperature Excursion Report",
  geofence_events: "Geofence Event Report",
  task_completion: "Task Completion Report",
  haccp_compliance: "HACCP Compliance Report",
  batch_traceability: "Batch Traceability Report"
};

/**
 * Generate PDF report from report data
 * @param {string} reportType - Type of report
 * @param {object} reportData - Report data object
 * @returns {Promise<Buffer>} PDF buffer
 */
async function generatePDF(reportType, reportData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: REPORT_TITLES[reportType] || "UTtag Report",
          Author: "UTtag Automated Report System",
          Subject: `${reportType} - ${new Date().toISOString().substring(0, 10)}`,
          Creator: "UTtag"
        }
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      // Header
      renderHeader(doc, reportType, reportData);

      // Content based on report type
      switch (reportType) {
        case "temperature_excursion":
          renderTemperatureReport(doc, reportData);
          break;
        case "geofence_events":
          renderGeofenceReport(doc, reportData);
          break;
        case "task_completion":
          renderTaskReport(doc, reportData);
          break;
        case "haccp_compliance":
          renderHACCPReport(doc, reportData);
          break;
        case "batch_traceability":
          renderBatchReport(doc, reportData);
          break;
        default:
          renderGenericReport(doc, reportData);
      }

      // Footer
      renderFooter(doc, reportData);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Render report header
 */
function renderHeader(doc, reportType, reportData) {
  // Logo/Title
  doc.fontSize(24).font("Helvetica-Bold").text("UTtag", { align: "center" });
  doc.fontSize(16).font("Helvetica").text(REPORT_TITLES[reportType] || "Report", { align: "center" });
  doc.moveDown(0.5);

  // Subtitle in Chinese
  doc.fontSize(12).fillColor("#666666").text(REPORT_TITLES_ZH[reportType] || "", { align: "center" });
  doc.fillColor("#000000");
  doc.moveDown();

  // Period
  if (reportData.period) {
    const start = DateTime.fromISO(reportData.period.start).toFormat("yyyy-MM-dd HH:mm");
    const end = DateTime.fromISO(reportData.period.end).toFormat("yyyy-MM-dd HH:mm");
    doc.fontSize(10).fillColor("#666666").text(`Report Period: ${start} to ${end}`, { align: "center" });
    doc.fillColor("#000000");
  }

  doc.moveDown();

  // Horizontal line
  doc.strokeColor("#3b82f6").lineWidth(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.strokeColor("#000000").lineWidth(1);
  doc.moveDown();
}

/**
 * Render temperature excursion report content
 */
function renderTemperatureReport(doc, data) {
  const summary = data.summary || {};

  // Summary Section
  doc.fontSize(14).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(11).font("Helvetica");
  doc.text(`Total Tags Monitored: ${summary.total_tags_monitored || 0}`);
  doc.text(`Tags with Excursions: ${summary.tags_with_excursions || 0}`);
  doc.text(`Total Excursion Events: ${summary.total_excursion_events || 0}`);
  doc.text(`Critical Events: ${summary.critical_events || 0}`);
  if (summary.thresholds) {
    doc.text(`Thresholds: ${summary.thresholds.min}C - ${summary.thresholds.max}C`);
  }
  doc.moveDown();

  // Excursions Section
  if (data.excursions && data.excursions.length > 0) {
    doc.fontSize(14).font("Helvetica-Bold").text("Excursion Events", { underline: true });
    doc.moveDown(0.5);

    const excursionsToShow = data.excursions.slice(0, 20);
    excursionsToShow.forEach((exc, i) => {
      // Check for page break
      if (doc.y > 700) {
        doc.addPage();
      }

      const startTime = DateTime.fromISO(exc.start).toFormat("yyyy-MM-dd HH:mm");
      const severity = exc.severity.toUpperCase();
      const severityColor = exc.severity === "critical" ? "#dc2626" :
                           exc.severity === "warning" ? "#f59e0b" : "#6b7280";

      doc.fontSize(11).font("Helvetica-Bold").text(`Event #${i + 1}: ${exc.mac}`);
      doc.fontSize(10).font("Helvetica");
      doc.text(`  Start: ${startTime}`);
      doc.text(`  Duration: ${exc.duration_minutes} minutes`);
      doc.text(`  Temperature Range: ${exc.min_temperature}C - ${exc.max_temperature}C`);
      doc.fillColor(severityColor).text(`  Severity: ${severity}`).fillColor("#000000");
      doc.moveDown(0.5);
    });

    if (data.excursions.length > 20) {
      doc.text(`... and ${data.excursions.length - 20} more events`);
    }
  } else {
    doc.fontSize(11).fillColor("#22c55e").text("No temperature excursions detected during this period.");
    doc.fillColor("#000000");
  }
}

/**
 * Render geofence report content
 */
function renderGeofenceReport(doc, data) {
  const summary = data.summary || {};

  doc.fontSize(14).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(11).font("Helvetica");
  doc.text(`Total Events: ${summary.total_events || 0}`);
  doc.text(`Entry Events: ${summary.entry_events || 0}`);
  doc.text(`Exit Events: ${summary.exit_events || 0}`);
  doc.text(`Unique Tags: ${summary.unique_tags || 0}`);
  doc.text(`Unique Zones: ${summary.unique_zones || 0}`);
  doc.moveDown();

  if (data.events && data.events.length > 0) {
    doc.fontSize(14).font("Helvetica-Bold").text("Event Details", { underline: true });
    doc.moveDown(0.5);

    data.events.slice(0, 30).forEach((event, i) => {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(10).text(`${i + 1}. ${event.mac} - ${event.type} at ${event.zone_name || event.zone_id}`);
      doc.text(`   Time: ${DateTime.fromISO(event.timestamp).toFormat("yyyy-MM-dd HH:mm")}`);
    });
  } else {
    doc.text("No geofence events recorded during this period.");
  }
}

/**
 * Render task completion report content
 */
function renderTaskReport(doc, data) {
  const summary = data.summary || {};

  doc.fontSize(14).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(11).font("Helvetica");
  doc.text(`Total Tasks: ${summary.total_tasks || 0}`);
  doc.text(`Completed: ${summary.completed_tasks || 0}`);
  doc.text(`Pending: ${summary.pending_tasks || 0}`);
  doc.text(`Overdue: ${summary.overdue_tasks || 0}`);
  doc.text(`Completion Rate: ${summary.completion_rate || 0}%`);
  doc.moveDown();

  if (summary.total_tasks === 0) {
    doc.text("No tasks recorded during this period.");
  }
}

/**
 * Render HACCP compliance report content
 */
function renderHACCPReport(doc, data) {
  const summary = data.summary || {};

  // Summary
  doc.fontSize(14).font("Helvetica-Bold").text("Compliance Summary", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(11).font("Helvetica");
  doc.text(`Total CCPs Monitored: ${summary.total_ccps_monitored || 0}`);
  doc.text(`Compliant CCPs: ${summary.compliant_ccps || 0}`);
  doc.text(`Non-Compliant CCPs: ${summary.non_compliant_ccps || 0}`);

  const complianceRate = summary.compliance_rate || 0;
  const rateColor = complianceRate >= 95 ? "#22c55e" : complianceRate >= 80 ? "#f59e0b" : "#dc2626";
  doc.fillColor(rateColor).text(`Compliance Rate: ${complianceRate}%`).fillColor("#000000");

  doc.text(`Critical Limits: ${summary.critical_limits?.min}C - ${summary.critical_limits?.max}C`);
  doc.moveDown();

  // CCP Status
  if (data.ccp_status && data.ccp_status.length > 0) {
    doc.fontSize(14).font("Helvetica-Bold").text("CCP Status", { underline: true });
    doc.moveDown(0.5);

    data.ccp_status.forEach(ccp => {
      if (doc.y > 700) doc.addPage();

      const statusColor = ccp.status === "compliant" ? "#22c55e" : "#dc2626";
      doc.fontSize(10).font("Helvetica-Bold").text(`${ccp.mac}`);
      doc.font("Helvetica");
      doc.fillColor(statusColor).text(`  Status: ${ccp.status.toUpperCase()}`).fillColor("#000000");
      doc.text(`  Temperature: ${ccp.min_temp}C - ${ccp.max_temp}C (Avg: ${ccp.avg_temp}C)`);
      doc.text(`  Readings: ${ccp.reading_count} | Excursions: ${ccp.excursion_count}`);
      doc.moveDown(0.3);
    });
  }

  // Deviations
  if (data.deviations && data.deviations.length > 0) {
    doc.addPage();
    doc.fontSize(14).font("Helvetica-Bold").text("Deviations Requiring Corrective Action", { underline: true });
    doc.moveDown(0.5);

    data.deviations.forEach((dev, i) => {
      doc.fontSize(10).font("Helvetica");
      doc.text(`${i + 1}. ${dev.mac} - ${dev.type.replace("_", " ").toUpperCase()}`);
      doc.text(`   Deviation: ${dev.deviation.toFixed(1)}C`);
      doc.text(`   Corrective Action Required: ${dev.corrective_action_required ? "YES" : "No"}`);
      doc.moveDown(0.3);
    });
  }

  // Verification Records
  if (data.verification_records) {
    doc.moveDown();
    doc.fontSize(12).font("Helvetica-Bold").text("Verification Records");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Monitoring Frequency: ${data.verification_records.monitoring_frequency}`);
    doc.text(`Calibration Status: ${data.verification_records.calibration_status}`);
    doc.text(`Record Keeping: ${data.verification_records.record_keeping}`);
  }
}

/**
 * Render batch traceability report content
 */
function renderBatchReport(doc, data) {
  const summary = data.summary || {};

  doc.fontSize(14).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.moveDown(0.5);

  doc.fontSize(11).font("Helvetica");
  doc.text(`Batches Tracked: ${summary.batches_tracked || 0}`);
  doc.text(`Total Handovers: ${summary.total_handovers || 0}`);
  doc.text(`Temperature Compliant: ${summary.temperature_compliant || 0}`);
  doc.moveDown();

  if (summary.batches_tracked === 0) {
    doc.text("No batch traceability data available for this period.");
  }
}

/**
 * Render generic report for unknown types
 */
function renderGenericReport(doc, data) {
  doc.fontSize(14).font("Helvetica-Bold").text("Report Data", { underline: true });
  doc.moveDown(0.5);

  if (data.summary) {
    doc.fontSize(11).font("Helvetica");
    Object.entries(data.summary).forEach(([key, value]) => {
      if (typeof value !== "object") {
        const label = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        doc.text(`${label}: ${value}`);
      }
    });
  }
}

/**
 * Render report footer
 */
function renderFooter(doc, data) {
  // Go to bottom of page
  const bottomY = doc.page.height - 60;
  doc.y = bottomY;

  // Horizontal line
  doc.strokeColor("#e5e7eb");
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.strokeColor("#000000");
  doc.moveDown(0.3);

  // Footer text
  doc.fontSize(8).fillColor("#6b7280");
  const generatedAt = DateTime.fromISO(data.generated_at || new Date().toISOString()).toFormat("yyyy-MM-dd HH:mm:ss");
  doc.text(`Generated: ${generatedAt} | UTtag Automated Report System`, { align: "center" });
  doc.text("This is an automatically generated report. Please do not reply.", { align: "center" });
  doc.fillColor("#000000");
}

module.exports = { generatePDF };
