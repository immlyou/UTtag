# System Design Document (SDD)
# Phase 2: Report Scheduling & Auto-send

**Document Version:** 1.0
**Last Updated:** 2026-03-18
**Author:** SA Agent
**Status:** Draft
**Project:** UTtag - IoT Cold Chain Tracking Dashboard

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [Backend Implementation](#3-backend-implementation)
4. [Frontend Implementation](#4-frontend-implementation)
5. [Sequence Diagrams](#5-sequence-diagrams)
6. [Error Handling](#6-error-handling)
7. [Security Considerations](#7-security-considerations)
8. [Deployment Notes](#8-deployment-notes)

---

## 1. Architecture Overview

### 1.1 Component Diagram

```
+------------------------------------------------------------------+
|                        UTtag Platform                             |
+------------------------------------------------------------------+
|                                                                   |
|  +-------------+     +------------------+     +----------------+  |
|  |   Browser   |---->|  Express Server  |---->|   Supabase     |  |
|  | (Vanilla JS)|     |   (server.js)    |     |  (PostgreSQL)  |  |
|  +-------------+     +--------+---------+     +----------------+  |
|                               |                       ^           |
|                               v                       |           |
|  +------------------------------------------------------------+  |
|  |                    Scheduler System                         |  |
|  |  +-------------+  +----------------+  +------------------+  |  |
|  |  | node-cron   |->| SchedulerSvc   |->| ReportGenerator  |  |  |
|  |  | (lib/cron)  |  | (lib/scheduler)|  | (lib/reports)    |  |  |
|  |  +-------------+  +--------+-------+  +--------+---------+  |  |
|  |                            |                   |             |  |
|  |                            v                   v             |  |
|  |                   +----------------+  +------------------+   |  |
|  |                   |  EmailService  |  |  PDFGenerator    |   |  |
|  |                   |  (lib/email)   |  |  (lib/pdf)       |   |  |
|  |                   |  [Resend API]  |  |  [PDFKit]        |   |  |
|  |                   +----------------+  +------------------+   |  |
|  +------------------------------------------------------------+  |
|                                                                   |
+------------------------------------------------------------------+
```

### 1.2 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Scheduler | node-cron | ^3.0.0 | Cron job management |
| Email | Resend | ^3.0.0 | Email delivery |
| PDF | pdfkit | ^0.15.0 | PDF generation |
| Timezone | luxon | ^3.4.0 | Timezone handling |
| Queue | Built-in | - | PostgreSQL-backed queue |

### 1.3 New Dependencies (package.json)

```json
{
  "dependencies": {
    "node-cron": "^3.0.3",
    "resend": "^3.2.0",
    "pdfkit": "^0.15.0",
    "luxon": "^3.4.4"
  }
}
```

---

## 2. Database Schema

### 2.1 New Tables (SQL)

```sql
-- ============================================
-- Report Scheduling System
-- ============================================

-- Report Schedules (報表排程)
CREATE TABLE report_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Ownership
  created_by UUID REFERENCES admins(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- Schedule Identity
  name TEXT NOT NULL,
  description TEXT,

  -- Report Configuration
  report_type TEXT NOT NULL CHECK (report_type IN (
    'temperature_excursion',
    'geofence_events',
    'task_completion',
    'haccp_compliance',
    'batch_traceability'
  )),

  -- Filters (JSONB for flexibility)
  tag_macs TEXT[] DEFAULT '{}',
  geofence_ids UUID[] DEFAULT '{}',
  date_range_type TEXT DEFAULT 'last_24h' CHECK (date_range_type IN (
    'last_24h', 'last_7d', 'last_30d', 'last_month', 'custom'
  )),
  custom_range_days INTEGER,

  -- Schedule Timing
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  run_at_hour INTEGER NOT NULL CHECK (run_at_hour >= 0 AND run_at_hour <= 23),
  run_at_minute INTEGER DEFAULT 0 CHECK (run_at_minute >= 0 AND run_at_minute <= 59),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
  timezone TEXT DEFAULT 'Asia/Taipei',

  -- Delivery
  delivery_method TEXT DEFAULT 'email' CHECK (delivery_method IN ('email', 'line', 'telegram')),
  recipients JSONB DEFAULT '[]',

  -- Status
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed', 'partial')),
  last_run_error TEXT,
  next_run_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Report Executions (報表執行紀錄)
CREATE TABLE report_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES report_schedules(id) ON DELETE CASCADE,

  -- Execution Details
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_message TEXT,

  -- Report Data
  report_data JSONB,
  pdf_url TEXT,
  pdf_size_bytes INTEGER,

  -- Delivery Status
  delivery_status JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_schedules_next_run ON report_schedules(next_run_at) WHERE enabled = true;
CREATE INDEX idx_schedules_created_by ON report_schedules(created_by);
CREATE INDEX idx_schedules_client ON report_schedules(client_id);
CREATE INDEX idx_executions_schedule ON report_executions(schedule_id);
CREATE INDEX idx_executions_created ON report_executions(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER report_schedules_updated_at
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 2.2 Schema Relationships

```
admins ─────┐
            │ 1:n
            ▼
clients ───► report_schedules ───► report_executions
                    │
                    │ references
                    ▼
            sensor_data, client_tags
```

---

## 3. Backend Implementation

### 3.1 Directory Structure

```
/Users/imchris/UTtag/
├── lib/
│   ├── scheduler.js      # Scheduler service
│   ├── reports/
│   │   ├── index.js      # Report generator factory
│   │   ├── temperature.js
│   │   ├── geofence.js
│   │   ├── task.js
│   │   └── haccp.js
│   ├── pdf.js            # PDF generator
│   └── email.js          # Email service (Resend)
├── api/
│   └── schedules/
│       ├── index.js      # GET list, POST create
│       ├── [id].js       # GET, PUT, DELETE by ID
│       ├── run.js        # POST manual trigger
│       └── preview.js    # POST preview
└── server.js             # Add scheduler init
```

### 3.2 Scheduler Service (lib/scheduler.js)

```javascript
const cron = require("node-cron");
const { DateTime } = require("luxon");
const { supabase } = require("./supabase");
const { generateReport } = require("./reports");
const { sendReportEmail } = require("./email");
const { generatePDF } = require("./pdf");

// Store active cron jobs
const activeJobs = new Map();

// Initialize scheduler on server startup
async function initScheduler() {
  console.log("[Scheduler] Initializing...");

  // Run check every minute
  cron.schedule("* * * * *", async () => {
    await processDueSchedules();
  });

  console.log("[Scheduler] Started - checking every minute");
}

// Process all due schedules
async function processDueSchedules() {
  const now = DateTime.now().setZone("UTC");

  const { data: dueSchedules, error } = await supabase
    .from("report_schedules")
    .select("*")
    .eq("enabled", true)
    .lte("next_run_at", now.toISO())
    .order("next_run_at", { ascending: true })
    .limit(10);

  if (error) {
    console.error("[Scheduler] Error fetching schedules:", error);
    return;
  }

  for (const schedule of dueSchedules || []) {
    await executeSchedule(schedule);
  }
}

// Execute a single schedule
async function executeSchedule(schedule) {
  const executionId = crypto.randomUUID();
  console.log(`[Scheduler] Executing schedule ${schedule.id} (${schedule.name})`);

  // Create execution record
  await supabase.from("report_executions").insert({
    id: executionId,
    schedule_id: schedule.id,
    status: "running"
  });

  try {
    // Generate report data
    const reportData = await generateReport(schedule);

    // Generate PDF
    const pdfBuffer = await generatePDF(schedule.report_type, reportData);

    // Send emails
    const deliveryStatus = [];
    for (const recipient of schedule.recipients || []) {
      try {
        await sendReportEmail({
          to: recipient.email,
          name: recipient.name,
          reportType: schedule.report_type,
          reportName: schedule.name,
          reportData,
          pdfBuffer
        });
        deliveryStatus.push({
          recipient: recipient.email,
          status: "sent",
          sent_at: new Date().toISOString()
        });
      } catch (emailErr) {
        deliveryStatus.push({
          recipient: recipient.email,
          status: "failed",
          error: emailErr.message
        });
      }
    }

    // Update execution record
    await supabase.from("report_executions").update({
      status: deliveryStatus.every(d => d.status === "sent") ? "success" : "partial",
      completed_at: new Date().toISOString(),
      report_data: reportData,
      pdf_size_bytes: pdfBuffer.length,
      delivery_status: deliveryStatus
    }).eq("id", executionId);

    // Update schedule
    const nextRun = calculateNextRun(schedule);
    await supabase.from("report_schedules").update({
      last_run_at: new Date().toISOString(),
      last_run_status: "success",
      last_run_error: null,
      next_run_at: nextRun.toISO()
    }).eq("id", schedule.id);

    console.log(`[Scheduler] Completed schedule ${schedule.id}`);

  } catch (err) {
    console.error(`[Scheduler] Error executing schedule ${schedule.id}:`, err);

    await supabase.from("report_executions").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: err.message
    }).eq("id", executionId);

    const nextRun = calculateNextRun(schedule);
    await supabase.from("report_schedules").update({
      last_run_at: new Date().toISOString(),
      last_run_status: "failed",
      last_run_error: err.message,
      next_run_at: nextRun.toISO()
    }).eq("id", schedule.id);
  }
}

// Calculate next run time based on frequency
function calculateNextRun(schedule) {
  const tz = schedule.timezone || "Asia/Taipei";
  let next = DateTime.now().setZone(tz);

  // Set to scheduled time
  next = next.set({
    hour: schedule.run_at_hour,
    minute: schedule.run_at_minute || 0,
    second: 0,
    millisecond: 0
  });

  // If already past, move to next occurrence
  if (next <= DateTime.now().setZone(tz)) {
    switch (schedule.frequency) {
      case "daily":
        next = next.plus({ days: 1 });
        break;
      case "weekly":
        next = next.plus({ weeks: 1 });
        if (schedule.day_of_week !== undefined) {
          while (next.weekday % 7 !== schedule.day_of_week) {
            next = next.plus({ days: 1 });
          }
        }
        break;
      case "monthly":
        next = next.plus({ months: 1 });
        if (schedule.day_of_month) {
          next = next.set({ day: Math.min(schedule.day_of_month, next.daysInMonth) });
        }
        break;
    }
  }

  return next.toUTC();
}

// Manual trigger
async function triggerSchedule(scheduleId) {
  const { data: schedule, error } = await supabase
    .from("report_schedules")
    .select("*")
    .eq("id", scheduleId)
    .single();

  if (error || !schedule) {
    throw new Error("Schedule not found");
  }

  await executeSchedule(schedule);
  return { success: true };
}

module.exports = { initScheduler, triggerSchedule, calculateNextRun };
```

### 3.3 Report Generator (lib/reports/index.js)

```javascript
const { supabase } = require("../supabase");
const { DateTime } = require("luxon");

// Report type handlers
const reportGenerators = {
  temperature_excursion: require("./temperature"),
  geofence_events: require("./geofence"),
  task_completion: require("./task"),
  haccp_compliance: require("./haccp"),
};

async function generateReport(schedule) {
  const generator = reportGenerators[schedule.report_type];
  if (!generator) {
    throw new Error(`Unknown report type: ${schedule.report_type}`);
  }

  // Calculate date range
  const dateRange = calculateDateRange(schedule);

  // Get tag MACs (empty = all)
  const tagMacs = schedule.tag_macs?.length > 0 ? schedule.tag_macs : null;

  return generator.generate({
    dateRange,
    tagMacs,
    geofenceIds: schedule.geofence_ids,
    timezone: schedule.timezone || "Asia/Taipei"
  });
}

function calculateDateRange(schedule) {
  const tz = schedule.timezone || "Asia/Taipei";
  const now = DateTime.now().setZone(tz);
  let start, end = now;

  switch (schedule.date_range_type) {
    case "last_24h":
      start = now.minus({ hours: 24 });
      break;
    case "last_7d":
      start = now.minus({ days: 7 });
      break;
    case "last_30d":
      start = now.minus({ days: 30 });
      break;
    case "last_month":
      start = now.minus({ months: 1 }).startOf("month");
      end = now.minus({ months: 1 }).endOf("month");
      break;
    case "custom":
      start = now.minus({ days: schedule.custom_range_days || 7 });
      break;
    default:
      start = now.minus({ hours: 24 });
  }

  return { start: start.toISO(), end: end.toISO() };
}

module.exports = { generateReport };
```

### 3.4 Temperature Excursion Report (lib/reports/temperature.js)

```javascript
const { supabase } = require("../supabase");

const TEMP_MIN = 2;
const TEMP_MAX = 8;

async function generate({ dateRange, tagMacs, timezone }) {
  // Build query
  let query = supabase
    .from("sensor_data")
    .select("*")
    .gte("created_at", dateRange.start)
    .lte("created_at", dateRange.end)
    .order("created_at", { ascending: true });

  if (tagMacs) {
    query = query.in("mac", tagMacs);
  }

  const { data: sensorData, error } = await query;
  if (error) throw error;

  // Find excursions
  const excursions = [];
  const tagStats = {};
  let currentExcursion = null;

  for (const reading of sensorData || []) {
    const temp = parseFloat(reading.temperature);
    if (temp == null || isNaN(temp)) continue;

    const mac = reading.mac;
    if (!tagStats[mac]) {
      tagStats[mac] = { readings: 0, excursions: 0, minTemp: temp, maxTemp: temp };
    }
    tagStats[mac].readings++;
    tagStats[mac].minTemp = Math.min(tagStats[mac].minTemp, temp);
    tagStats[mac].maxTemp = Math.max(tagStats[mac].maxTemp, temp);

    const isExcursion = temp < TEMP_MIN || temp > TEMP_MAX;

    if (isExcursion) {
      if (!currentExcursion || currentExcursion.mac !== mac) {
        // Start new excursion
        if (currentExcursion) excursions.push(currentExcursion);
        currentExcursion = {
          mac,
          start: reading.created_at,
          end: reading.created_at,
          maxTemp: temp,
          minTemp: temp,
          readings: [reading]
        };
      } else {
        // Continue excursion
        currentExcursion.end = reading.created_at;
        currentExcursion.maxTemp = Math.max(currentExcursion.maxTemp, temp);
        currentExcursion.minTemp = Math.min(currentExcursion.minTemp, temp);
        currentExcursion.readings.push(reading);
      }
      tagStats[mac].excursions++;
    } else if (currentExcursion && currentExcursion.mac === mac) {
      // End excursion
      excursions.push(currentExcursion);
      currentExcursion = null;
    }
  }

  if (currentExcursion) excursions.push(currentExcursion);

  // Calculate duration and severity
  const processedExcursions = excursions.map(exc => {
    const start = new Date(exc.start);
    const end = new Date(exc.end);
    const durationMs = end - start;
    const durationMin = Math.round(durationMs / 60000);

    const deviation = Math.max(
      Math.abs(exc.maxTemp - TEMP_MAX),
      Math.abs(exc.minTemp - TEMP_MIN)
    );

    return {
      mac: exc.mac,
      start: exc.start,
      end: exc.end,
      duration_minutes: durationMin,
      max_temperature: exc.maxTemp,
      min_temperature: exc.minTemp,
      severity: deviation > 5 ? "critical" : deviation > 2 ? "warning" : "minor",
      reading_count: exc.readings.length
    };
  });

  // Summary
  const tagsMonitored = Object.keys(tagStats).length;
  const tagsWithExcursions = new Set(processedExcursions.map(e => e.mac)).size;
  const criticalCount = processedExcursions.filter(e => e.severity === "critical").length;

  return {
    report_type: "temperature_excursion",
    generated_at: new Date().toISOString(),
    period: dateRange,
    summary: {
      total_tags_monitored: tagsMonitored,
      tags_with_excursions: tagsWithExcursions,
      total_excursion_events: processedExcursions.length,
      critical_events: criticalCount,
      thresholds: { min: TEMP_MIN, max: TEMP_MAX }
    },
    tag_statistics: tagStats,
    excursions: processedExcursions
  };
}

module.exports = { generate };
```

### 3.5 PDF Generator (lib/pdf.js)

```javascript
const PDFDocument = require("pdfkit");
const { DateTime } = require("luxon");

const REPORT_TITLES = {
  temperature_excursion: "Temperature Excursion Report",
  geofence_events: "Geofence Event Report",
  task_completion: "Task Completion Report",
  haccp_compliance: "HACCP Compliance Report",
  batch_traceability: "Batch Traceability Report"
};

async function generatePDF(reportType, reportData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];

      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      // Header
      doc.fontSize(20).text("UTtag", { align: "center" });
      doc.fontSize(16).text(REPORT_TITLES[reportType] || "Report", { align: "center" });
      doc.moveDown();

      // Period
      if (reportData.period) {
        const start = DateTime.fromISO(reportData.period.start).toFormat("yyyy-MM-dd HH:mm");
        const end = DateTime.fromISO(reportData.period.end).toFormat("yyyy-MM-dd HH:mm");
        doc.fontSize(10).text(`Period: ${start} to ${end}`, { align: "center" });
      }
      doc.moveDown();

      // Summary section
      doc.fontSize(14).text("Summary", { underline: true });
      doc.moveDown(0.5);

      if (reportData.summary) {
        Object.entries(reportData.summary).forEach(([key, value]) => {
          if (typeof value !== "object") {
            const label = key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
            doc.fontSize(10).text(`${label}: ${value}`);
          }
        });
      }
      doc.moveDown();

      // Excursions for temperature report
      if (reportType === "temperature_excursion" && reportData.excursions?.length > 0) {
        doc.fontSize(14).text("Excursion Events", { underline: true });
        doc.moveDown(0.5);

        reportData.excursions.slice(0, 20).forEach((exc, i) => {
          doc.fontSize(10);
          doc.text(`Event #${i + 1}: ${exc.mac}`);
          doc.text(`  Start: ${DateTime.fromISO(exc.start).toFormat("yyyy-MM-dd HH:mm")}`);
          doc.text(`  Duration: ${exc.duration_minutes} minutes`);
          doc.text(`  Max Temp: ${exc.max_temperature}C | Severity: ${exc.severity.toUpperCase()}`);
          doc.moveDown(0.5);
        });

        if (reportData.excursions.length > 20) {
          doc.text(`... and ${reportData.excursions.length - 20} more events`);
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).text(
        `Generated: ${DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss")} | UTtag Automated Report`,
        { align: "center" }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generatePDF };
```

### 3.6 Email Service (lib/email.js)

```javascript
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const REPORT_NAMES = {
  temperature_excursion: "Temperature Excursion Report",
  geofence_events: "Geofence Event Report",
  task_completion: "Task Completion Report",
  haccp_compliance: "HACCP Compliance Report"
};

async function sendReportEmail({ to, name, reportType, reportName, reportData, pdfBuffer }) {
  const reportTitle = REPORT_NAMES[reportType] || "Report";
  const summary = reportData.summary || {};

  // Build summary HTML
  let summaryHtml = "";
  if (reportType === "temperature_excursion") {
    summaryHtml = `
      <tr><td>Tags Monitored</td><td>${summary.total_tags_monitored || 0}</td></tr>
      <tr><td>Excursion Events</td><td>${summary.total_excursion_events || 0}</td></tr>
      <tr><td>Critical Events</td><td style="color:#dc2626;">${summary.critical_events || 0}</td></tr>
    `;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e40af; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0;">UTtag</h1>
        <p style="margin: 5px 0 0 0;">Automated Report</p>
      </div>

      <div style="padding: 20px;">
        <h2 style="color: #1e3a8a;">${reportTitle}</h2>
        <p><strong>${reportName}</strong></p>
        <p style="color: #6b7280;">
          Period: ${reportData.period?.start?.substring(0, 10)} to ${reportData.period?.end?.substring(0, 10)}
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">Metric</th>
              <th style="padding: 10px; text-align: left; border-bottom: 2px solid #e5e7eb;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${summaryHtml}
          </tbody>
        </table>

        <p>Please see the attached PDF for detailed information.</p>
      </div>

      <div style="background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280;">
        <p>This is an automated report. Please do not reply.</p>
        <p>Manage schedules: <a href="${process.env.APP_URL || 'https://uttag.example.com'}/schedules">UTtag Dashboard</a></p>
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "UTtag <reports@uttag.example.com>",
    to: [to],
    subject: `[UTtag] ${reportTitle} - ${new Date().toISOString().substring(0, 10)}`,
    html,
    attachments: pdfBuffer ? [{
      filename: `${reportType}_${new Date().toISOString().substring(0, 10)}.pdf`,
      content: pdfBuffer.toString("base64")
    }] : []
  });

  if (error) throw new Error(error.message);
  return { success: true };
}

module.exports = { sendReportEmail };
```

### 3.7 API Endpoints

#### GET/POST /api/schedules (api/schedules/index.js)

```javascript
const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");
const { calculateNextRun } = require("../../lib/scheduler");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }

  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "Unauthorized", 401, req);

  if (req.method === "GET") {
    // List schedules
    let query = supabase
      .from("report_schedules")
      .select("*")
      .order("created_at", { ascending: false });

    if (admin) {
      query = query.eq("created_by", admin.id);
    } else if (apiKeyData) {
      query = query.eq("client_id", apiKeyData.client_id);
    }

    const { data, error: dbErr } = await query;
    if (dbErr) return error(res, dbErr.message, 400, req);

    return json(res, { schedules: data, total: data.length }, 200, req);
  }

  if (req.method === "POST") {
    // Create schedule
    const { name, report_type, frequency, run_at_hour, run_at_minute, day_of_week,
            day_of_month, timezone, date_range_type, tag_macs, recipients } = req.body;

    if (!name || !report_type || !frequency || run_at_hour === undefined) {
      return error(res, "Missing required fields", 400, req);
    }

    const schedule = {
      name,
      report_type,
      frequency,
      run_at_hour,
      run_at_minute: run_at_minute || 0,
      day_of_week,
      day_of_month,
      timezone: timezone || "Asia/Taipei",
      date_range_type: date_range_type || "last_24h",
      tag_macs: tag_macs || [],
      recipients: recipients || [],
      created_by: admin?.id || null,
      client_id: apiKeyData?.client_id || null,
      enabled: true
    };

    // Calculate next run
    const nextRun = calculateNextRun(schedule);
    schedule.next_run_at = nextRun.toISO();

    const { data, error: dbErr } = await supabase
      .from("report_schedules")
      .insert(schedule)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    return json(res, { id: data.id, next_run_at: data.next_run_at, message: "Schedule created" }, 201, req);
  }

  return error(res, "Method not allowed", 405, req);
};
```

#### PUT/DELETE /api/schedules/:id (api/schedules/[id].js)

```javascript
const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");
const { calculateNextRun } = require("../../lib/scheduler");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req); return res.status(200).end(); }

  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "Unauthorized", 401, req);

  const scheduleId = req.params?.id || req.query?.id;
  if (!scheduleId) return error(res, "Missing schedule ID", 400, req);

  // Verify ownership
  const { data: existing } = await supabase
    .from("report_schedules")
    .select("*")
    .eq("id", scheduleId)
    .single();

  if (!existing) return error(res, "Schedule not found", 404, req);

  if (admin && existing.created_by !== admin.id) {
    return error(res, "Not authorized", 403, req);
  }
  if (apiKeyData && existing.client_id !== apiKeyData.client_id) {
    return error(res, "Not authorized", 403, req);
  }

  if (req.method === "GET") {
    return json(res, existing, 200, req);
  }

  if (req.method === "PUT") {
    const updates = req.body;
    delete updates.id;
    delete updates.created_by;
    delete updates.created_at;

    // Recalculate next run if timing changed
    if (updates.frequency || updates.run_at_hour !== undefined || updates.enabled !== undefined) {
      const merged = { ...existing, ...updates };
      if (merged.enabled) {
        updates.next_run_at = calculateNextRun(merged).toISO();
      }
    }

    const { data, error: dbErr } = await supabase
      .from("report_schedules")
      .update(updates)
      .eq("id", scheduleId)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, data, 200, req);
  }

  if (req.method === "DELETE") {
    const { error: dbErr } = await supabase
      .from("report_schedules")
      .delete()
      .eq("id", scheduleId);

    if (dbErr) return error(res, dbErr.message, 400, req);
    return json(res, { message: "Schedule deleted" }, 200, req);
  }

  return error(res, "Method not allowed", 405, req);
};
```

### 3.8 Server Integration (server.js additions)

```javascript
// Add to server.js after existing requires
const { initScheduler } = require("./lib/scheduler");

// Add routes before proxy
app.use("/api/schedules", require("./api/schedules"));

// Initialize scheduler after server starts
app.listen(PORT, async () => {
  console.log(`UTtag server started: http://localhost:${PORT}`);

  // Start the report scheduler
  if (process.env.ENABLE_SCHEDULER !== "false") {
    await initScheduler();
  }
});
```

---

## 4. Frontend Implementation

### 4.1 HTML Structure (add to index.html)

```html
<!-- Schedules Panel -->
<section id="schedules-panel" class="panel">
  <h2>Report Schedules</h2>
  <div class="panel-actions">
    <button class="btn-primary" onclick="openScheduleModal()">+ New Schedule</button>
  </div>

  <div id="schedule-list" class="schedule-list">
    <!-- Rendered by JS -->
  </div>
</section>

<!-- Schedule Modal -->
<div id="schedule-modal" class="modal hidden">
  <div class="modal-content">
    <h3 id="schedule-modal-title">New Schedule</h3>
    <form id="schedule-form" onsubmit="saveSchedule(event)">
      <input type="hidden" id="schedule-id">

      <label>Name *</label>
      <input type="text" id="schedule-name" required>

      <label>Report Type *</label>
      <select id="schedule-type" required>
        <option value="temperature_excursion">Temperature Excursion</option>
        <option value="geofence_events">Geofence Events</option>
        <option value="task_completion">Task Completion</option>
        <option value="haccp_compliance">HACCP Compliance</option>
      </select>

      <label>Frequency *</label>
      <select id="schedule-frequency" onchange="updateFrequencyOptions()">
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>

      <div id="day-of-week-group" class="hidden">
        <label>Day of Week</label>
        <select id="schedule-dow">
          <option value="0">Sunday</option>
          <option value="1">Monday</option>
          <option value="2">Tuesday</option>
          <option value="3">Wednesday</option>
          <option value="4">Thursday</option>
          <option value="5">Friday</option>
          <option value="6">Saturday</option>
        </select>
      </div>

      <div id="day-of-month-group" class="hidden">
        <label>Day of Month</label>
        <input type="number" id="schedule-dom" min="1" max="31" value="1">
      </div>

      <label>Time (Hour)</label>
      <input type="number" id="schedule-hour" min="0" max="23" value="6">

      <label>Data Range</label>
      <select id="schedule-range">
        <option value="last_24h">Last 24 Hours</option>
        <option value="last_7d">Last 7 Days</option>
        <option value="last_30d">Last 30 Days</option>
      </select>

      <label>Recipients (comma-separated emails)</label>
      <input type="text" id="schedule-recipients" placeholder="email1@example.com, email2@example.com">

      <div class="modal-actions">
        <button type="button" class="btn-ghost" onclick="closeScheduleModal()">Cancel</button>
        <button type="button" class="btn-secondary" onclick="previewReport()">Preview</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>
  </div>
</div>
```

### 4.2 JavaScript Functions (add to app.js)

```javascript
// ================================================================
//  [G2] Report Scheduling
// ================================================================

let schedules = [];

async function loadSchedules() {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    const resp = await fetch("/api/schedules", { headers });
    const data = await resp.json();
    schedules = data.schedules || [];
    renderScheduleList();
  } catch (err) {
    console.error("Failed to load schedules:", err);
    showToast("Failed to load schedules", "error");
  }
}

function renderScheduleList() {
  const container = document.getElementById("schedule-list");
  if (!container) return;

  if (schedules.length === 0) {
    container.innerHTML = '<div class="empty-state">No schedules yet. Create your first schedule!</div>';
    return;
  }

  const frequencyLabels = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
  const typeLabels = {
    temperature_excursion: "Temperature Excursion",
    geofence_events: "Geofence Events",
    task_completion: "Task Completion",
    haccp_compliance: "HACCP Compliance"
  };

  container.innerHTML = schedules.map(s => {
    const statusIcon = s.enabled ? "●" : "○";
    const statusClass = s.enabled ? "active" : "inactive";
    const lastStatus = s.last_run_status === "success" ? "success" :
                       s.last_run_status === "failed" ? "error" : "";
    const nextRun = s.next_run_at ? new Date(s.next_run_at).toLocaleString() : "N/A";
    const lastRun = s.last_run_at ? new Date(s.last_run_at).toLocaleString() : "Never";

    return `
      <div class="schedule-item ${statusClass}" data-id="${s.id}">
        <div class="schedule-header">
          <span class="status-indicator ${statusClass}">${statusIcon}</span>
          <strong>${s.name}</strong>
          <span class="badge">${typeLabels[s.report_type] || s.report_type}</span>
        </div>
        <div class="schedule-details">
          <span>Frequency: ${frequencyLabels[s.frequency]} at ${String(s.run_at_hour).padStart(2, '0')}:${String(s.run_at_minute || 0).padStart(2, '0')}</span>
          <span>Next: ${nextRun}</span>
          <span class="${lastStatus}">Last: ${lastRun} ${s.last_run_status ? `(${s.last_run_status})` : ""}</span>
        </div>
        <div class="schedule-actions">
          <button class="btn-ghost-sm" onclick="toggleSchedule('${s.id}', ${!s.enabled})">
            ${s.enabled ? "Disable" : "Enable"}
          </button>
          <button class="btn-ghost-sm" onclick="editSchedule('${s.id}')">Edit</button>
          <button class="btn-ghost-sm" onclick="runScheduleNow('${s.id}')">Run Now</button>
          <button class="btn-ghost-sm danger" onclick="deleteSchedule('${s.id}')">Delete</button>
        </div>
      </div>
    `;
  }).join("");
}

function openScheduleModal(scheduleId = null) {
  const modal = document.getElementById("schedule-modal");
  const title = document.getElementById("schedule-modal-title");
  const form = document.getElementById("schedule-form");

  form.reset();
  document.getElementById("schedule-id").value = scheduleId || "";

  if (scheduleId) {
    const s = schedules.find(x => x.id === scheduleId);
    if (s) {
      title.textContent = "Edit Schedule";
      document.getElementById("schedule-name").value = s.name;
      document.getElementById("schedule-type").value = s.report_type;
      document.getElementById("schedule-frequency").value = s.frequency;
      document.getElementById("schedule-hour").value = s.run_at_hour;
      document.getElementById("schedule-range").value = s.date_range_type || "last_24h";
      document.getElementById("schedule-recipients").value =
        (s.recipients || []).map(r => r.email).join(", ");
      if (s.day_of_week !== null) document.getElementById("schedule-dow").value = s.day_of_week;
      if (s.day_of_month) document.getElementById("schedule-dom").value = s.day_of_month;
    }
  } else {
    title.textContent = "New Schedule";
  }

  updateFrequencyOptions();
  modal.classList.remove("hidden");
}

function closeScheduleModal() {
  document.getElementById("schedule-modal").classList.add("hidden");
}

function updateFrequencyOptions() {
  const freq = document.getElementById("schedule-frequency").value;
  document.getElementById("day-of-week-group").classList.toggle("hidden", freq !== "weekly");
  document.getElementById("day-of-month-group").classList.toggle("hidden", freq !== "monthly");
}

async function saveSchedule(event) {
  event.preventDefault();

  const id = document.getElementById("schedule-id").value;
  const recipientEmails = document.getElementById("schedule-recipients").value
    .split(",")
    .map(e => e.trim())
    .filter(e => e)
    .map(email => ({ email, name: email.split("@")[0] }));

  const payload = {
    name: document.getElementById("schedule-name").value,
    report_type: document.getElementById("schedule-type").value,
    frequency: document.getElementById("schedule-frequency").value,
    run_at_hour: parseInt(document.getElementById("schedule-hour").value),
    date_range_type: document.getElementById("schedule-range").value,
    recipients: recipientEmails
  };

  if (payload.frequency === "weekly") {
    payload.day_of_week = parseInt(document.getElementById("schedule-dow").value);
  }
  if (payload.frequency === "monthly") {
    payload.day_of_month = parseInt(document.getElementById("schedule-dom").value);
  }

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const url = id ? `/api/schedules/${id}` : "/api/schedules";
    const method = id ? "PUT" : "POST";

    const resp = await fetch(url, { method, headers, body: JSON.stringify(payload) });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error || "Failed to save");

    showToast(id ? "Schedule updated" : "Schedule created", "success");
    closeScheduleModal();
    loadSchedules();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleSchedule(id, enabled) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/schedules/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ enabled })
    });

    if (!resp.ok) throw new Error("Failed to update");
    showToast(enabled ? "Schedule enabled" : "Schedule disabled", "success");
    loadSchedules();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteSchedule(id) {
  if (!confirm("Delete this schedule?")) return;

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/schedules/${id}`, {
      method: "DELETE",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!resp.ok) throw new Error("Failed to delete");
    showToast("Schedule deleted", "success");
    loadSchedules();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function runScheduleNow(id) {
  if (!confirm("Run this schedule now?")) return;

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/schedules/${id}/run`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!resp.ok) throw new Error("Failed to trigger");
    showToast("Report generation started", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function editSchedule(id) {
  openScheduleModal(id);
}

async function previewReport() {
  const reportType = document.getElementById("schedule-type").value;
  const dateRange = document.getElementById("schedule-range").value;

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/schedules/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ report_type: reportType, date_range_type: dateRange })
    });

    const data = await resp.json();
    alert(JSON.stringify(data.preview?.summary || data, null, 2));
  } catch (err) {
    showToast("Preview failed: " + err.message, "error");
  }
}
```

### 4.3 CSS Styles (add to style.css)

```css
/* Report Schedule Styles */
.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.schedule-item {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s;
}

.schedule-item.inactive {
  opacity: 0.6;
}

.schedule-item:hover {
  border-color: var(--accent);
}

.schedule-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.status-indicator {
  font-size: 12px;
}

.status-indicator.active { color: #22c55e; }
.status-indicator.inactive { color: #9ca3af; }

.schedule-details {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.schedule-details .success { color: #22c55e; }
.schedule-details .error { color: #ef4444; }

.schedule-actions {
  display: flex;
  gap: 8px;
}

.schedule-actions .danger { color: #ef4444; }

/* Modal Styles */
.modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal.hidden { display: none; }

.modal-content {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin: 0 0 20px 0;
}

.modal-content label {
  display: block;
  margin: 12px 0 4px;
  font-size: 13px;
  color: var(--text-muted);
}

.modal-content input,
.modal-content select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}
```

---

## 5. Sequence Diagrams

### 5.1 Schedule Creation Flow

```
User            Frontend           Backend            Supabase
 │                │                   │                  │
 │ Click "New"    │                   │                  │
 │───────────────>│                   │                  │
 │                │ Show modal        │                  │
 │<───────────────│                   │                  │
 │                │                   │                  │
 │ Fill form      │                   │                  │
 │ Submit         │                   │                  │
 │───────────────>│                   │                  │
 │                │ POST /schedules   │                  │
 │                │──────────────────>│                  │
 │                │                   │ Calculate next   │
 │                │                   │ run time         │
 │                │                   │                  │
 │                │                   │ INSERT schedule  │
 │                │                   │─────────────────>│
 │                │                   │<─────────────────│
 │                │                   │                  │
 │                │ { id, next_run }  │                  │
 │                │<──────────────────│                  │
 │ Show success   │                   │                  │
 │<───────────────│                   │                  │
```

### 5.2 Scheduled Report Execution Flow

```
Cron Job        Scheduler          Reports           Email           Supabase
   │               │                  │                │                │
   │ Every minute  │                  │                │                │
   │──────────────>│                  │                │                │
   │               │ Query due        │                │                │
   │               │ schedules        │                │                │
   │               │─────────────────────────────────────────────────-->│
   │               │<──────────────────────────────────────────────────│
   │               │                  │                │                │
   │               │ For each schedule│                │                │
   │               │──────────────────│                │                │
   │               │ INSERT execution │                │                │
   │               │─────────────────────────────────────────────────-->│
   │               │                  │                │                │
   │               │ generateReport() │                │                │
   │               │─────────────────>│                │                │
   │               │                  │ Query sensor   │                │
   │               │                  │ data           │                │
   │               │                  │──────────────────────────────-->│
   │               │                  │<─────────────────────────────────│
   │               │                  │                │                │
   │               │  reportData      │                │                │
   │               │<─────────────────│                │                │
   │               │                  │                │                │
   │               │ generatePDF()    │                │                │
   │               │───────────────────────────────────>│               │
   │               │<──────────────────────────────────│               │
   │               │                  │                │                │
   │               │ sendEmail()      │                │                │
   │               │─────────────────────────────────-->│               │
   │               │                  │                │ Send via      │
   │               │                  │                │ Resend API    │
   │               │<──────────────────────────────────│               │
   │               │                  │                │                │
   │               │ UPDATE execution │                │                │
   │               │ UPDATE schedule  │                │                │
   │               │─────────────────────────────────────────────────-->│
```

### 5.3 Manual Trigger Flow

```
User            Frontend           Backend            Scheduler
 │                │                   │                   │
 │ Click "Run"    │                   │                   │
 │───────────────>│                   │                   │
 │                │ POST /run         │                   │
 │                │──────────────────>│                   │
 │                │                   │ triggerSchedule() │
 │                │                   │──────────────────>│
 │                │                   │                   │
 │                │ 202 Accepted      │                   │
 │                │<──────────────────│                   │
 │ Show "Started" │                   │                   │
 │<───────────────│                   │                   │
 │                │                   │                   │
 │                │                   │ (async execution) │
 │                │                   │                   │
```

---

## 6. Error Handling

### 6.1 Retry Strategy for Failed Emails

```javascript
// lib/email.js - with retry logic
async function sendReportEmailWithRetry(params, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await sendReportEmail(params);
    } catch (err) {
      lastError = err;
      console.error(`[Email] Attempt ${attempt} failed:`, err.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
}
```

### 6.2 Report Generation Error Handling

```javascript
// In scheduler.js executeSchedule()
try {
  const reportData = await generateReport(schedule);
  // ... continue
} catch (err) {
  // Log error with context
  console.error(`[Report] Generation failed for ${schedule.id}:`, {
    error: err.message,
    stack: err.stack,
    schedule: {
      name: schedule.name,
      type: schedule.report_type,
      dateRange: schedule.date_range_type
    }
  });

  // Update execution record
  await supabase.from("report_executions").update({
    status: "failed",
    error_message: `Report generation failed: ${err.message}`
  }).eq("id", executionId);

  // Optionally notify admin
  if (process.env.ADMIN_EMAIL) {
    await sendAlertEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `[UTtag] Report Generation Failed: ${schedule.name}`,
      message: err.message
    });
  }
}
```

### 6.3 Logging and Monitoring

```javascript
// lib/logger.js
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || "info"];

function log(level, component, message, data = {}) {
  if (LOG_LEVELS[level] > CURRENT_LEVEL) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...data
  };

  console.log(JSON.stringify(entry));

  // In production, send to monitoring service
  if (process.env.NODE_ENV === "production" && level === "error") {
    // Send to Sentry, Datadog, etc.
  }
}

module.exports = { log };
```

---

## 7. Security Considerations

### 7.1 Authentication

- All schedule endpoints require admin token or valid API key
- Schedule ownership verified before modifications
- Recipients validated (email format)

### 7.2 Rate Limiting

```javascript
// Prevent schedule spam
const MAX_SCHEDULES_PER_USER = 50;

// In POST /schedules
const { count } = await supabase
  .from("report_schedules")
  .select("*", { count: "exact", head: true })
  .eq("created_by", admin.id);

if (count >= MAX_SCHEDULES_PER_USER) {
  return error(res, "Maximum schedules reached", 400, req);
}
```

### 7.3 Input Validation

```javascript
// Validate recipients
function validateRecipients(recipients) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return recipients.every(r => emailRegex.test(r.email));
}

// Validate timezone
function validateTimezone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
```

---

## 8. Deployment Notes

### 8.1 Environment Variables

```env
# Email Service (Resend)
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=UTtag <reports@uttag.example.com>

# Scheduler
ENABLE_SCHEDULER=true

# Monitoring
ADMIN_EMAIL=admin@uttag.example.com
LOG_LEVEL=info

# App
APP_URL=https://uttag.example.com
```

### 8.2 Database Migration Steps

1. Run schema migration:
```bash
psql $DATABASE_URL -f migrations/002_report_schedules.sql
```

2. Verify indexes:
```sql
SELECT indexname FROM pg_indexes WHERE tablename = 'report_schedules';
```

### 8.3 Production Checklist

- [ ] Resend account verified and API key configured
- [ ] Database tables created with indexes
- [ ] Environment variables set
- [ ] Email templates tested
- [ ] Scheduler health monitoring configured
- [ ] Error alerting configured
- [ ] Backup strategy for report_executions table

---

## Appendix

### A. Report Type Specifications

| Type | Data Source | Key Metrics |
|------|-------------|-------------|
| temperature_excursion | sensor_data | excursion count, duration, severity |
| geofence_events | geofence_logs | entry/exit count, dwell time |
| task_completion | tasks | completion rate, overdue count |
| haccp_compliance | sensor_data + tasks | CCP status, deviation count |

### B. Timezone Support

The system uses Luxon for timezone handling. All supported IANA timezones are valid (e.g., "Asia/Taipei", "America/New_York", "Europe/London").

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-18 | SA Agent | Initial design |
