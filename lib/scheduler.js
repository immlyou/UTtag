/**
 * Report Scheduler Service
 * Manages scheduled report generation and delivery
 */

const crypto = require("crypto");
const cron = require("node-cron");
const { DateTime } = require("luxon");
const { supabase } = require("./supabase");
const { generateReport } = require("./reports");
const { generatePDF } = require("./pdf");
const { sendReportEmail } = require("./email");

// Initialize scheduler on server startup
async function initScheduler() {
  console.log("[Scheduler] Initializing report scheduler...");

  // Run check every minute
  cron.schedule("* * * * *", async () => {
    await processDueSchedules();
  });

  console.log("[Scheduler] Started - checking every minute for due schedules");
}

// Process due schedules using atomic claiming (SELECT FOR UPDATE SKIP LOCKED).
// Each call to claim_due_schedule() picks at most one row, advances its
// next_run_at by 5 minutes so concurrent instances cannot re-claim it, and
// returns the row. We loop up to 10 times so a single instance can drain a
// backlog, but not starve other instances indefinitely.
async function processDueSchedules() {
  const MAX_CLAIMS = 10;

  for (let i = 0; i < MAX_CLAIMS; i++) {
    try {
      const { data, error } = await supabase.rpc("claim_due_schedule");

      if (error) {
        console.error("[Scheduler] Error claiming schedule:", error);
        break;
      }

      // claim_due_schedule returns a result set; an empty array means nothing
      // was due (or all due rows are already claimed by another instance).
      if (!data || data.length === 0) {
        break;
      }

      await executeSchedule(data[0]);
    } catch (err) {
      console.error("[Scheduler] Error processing schedules:", err);
      break;
    }
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

    // Send emails to all recipients
    const deliveryStatus = [];
    for (const recipient of schedule.recipients || []) {
      const email = typeof recipient === 'string' ? recipient : recipient.email;
      const name = typeof recipient === 'string' ? recipient.split('@')[0] : (recipient.name || email.split('@')[0]);
      try {
        await sendReportEmail({
          to: email,
          name: name,
          reportType: schedule.report_type,
          reportName: schedule.name,
          reportData,
          pdfBuffer
        });
        deliveryStatus.push({
          recipient: email,
          status: "sent",
          sent_at: new Date().toISOString()
        });
      } catch (emailErr) {
        console.error(`[Scheduler] Email failed for ${email}:`, emailErr.message);
        deliveryStatus.push({
          recipient: email,
          status: "failed",
          error: emailErr.message
        });
      }
    }

    // Determine overall status
    const allSent = deliveryStatus.every(d => d.status === "sent");
    const someSent = deliveryStatus.some(d => d.status === "sent");
    const finalStatus = allSent ? "success" : someSent ? "partial" : "failed";

    // Update execution record
    await supabase.from("report_executions").update({
      status: finalStatus === "failed" ? "failed" : "success",
      completed_at: new Date().toISOString(),
      report_data: reportData,
      pdf_size_bytes: pdfBuffer.length,
      delivery_status: deliveryStatus
    }).eq("id", executionId);

    // Update schedule with next run time
    const nextRun = calculateNextRun(schedule);
    await supabase.from("report_schedules").update({
      last_run_at: new Date().toISOString(),
      last_run_status: finalStatus,
      last_run_error: null,
      next_run_at: nextRun.toISO()
    }).eq("id", schedule.id);

    console.log(`[Scheduler] Completed schedule ${schedule.id} - Status: ${finalStatus}`);

  } catch (err) {
    console.error(`[Scheduler] Error executing schedule ${schedule.id}:`, err);

    // Update execution record with failure
    await supabase.from("report_executions").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: err.message
    }).eq("id", executionId);

    // Update schedule with next run time despite failure
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
  const now = DateTime.now().setZone(tz);

  switch (schedule.frequency) {
    case "daily":
      if (next <= now) {
        next = next.plus({ days: 1 });
      }
      break;

    case "weekly":
      // Move to next week if past
      if (next <= now) {
        next = next.plus({ days: 1 });
      }
      // Adjust to correct day of week
      if (schedule.day_of_week !== null && schedule.day_of_week !== undefined) {
        const targetDay = schedule.day_of_week; // 0 = Sunday
        while (next.weekday % 7 !== targetDay) {
          next = next.plus({ days: 1 });
        }
      }
      break;

    case "monthly":
      if (next <= now) {
        next = next.plus({ months: 1 });
      }
      // Adjust to correct day of month
      if (schedule.day_of_month) {
        const targetDay = Math.min(schedule.day_of_month, next.daysInMonth);
        next = next.set({ day: targetDay });
        // If target day already passed this month, move to next month
        if (next <= now) {
          next = next.plus({ months: 1 });
          const newTargetDay = Math.min(schedule.day_of_month, next.daysInMonth);
          next = next.set({ day: newTargetDay });
        }
      }
      break;
  }

  return next.toUTC();
}

// Manual trigger for a schedule
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
  return { success: true, message: "Schedule executed" };
}

module.exports = { initScheduler, triggerSchedule, calculateNextRun };
