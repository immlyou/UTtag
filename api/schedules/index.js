/**
 * Report Schedules API
 * GET /api/schedules - List schedules
 * POST /api/schedules - Create schedule
 * GET /api/schedules/:id - Get schedule
 * PUT /api/schedules/:id - Update schedule
 * DELETE /api/schedules/:id - Delete schedule
 * POST /api/schedules/:id/run - Manually trigger schedule
 * POST /api/schedules/preview - Preview report data
 */

const { supabase } = require("../../lib/supabase");
const { getAdminFromReq, getClientFromApiKey, cors, json, error } = require("../../lib/auth");
const { calculateNextRun, triggerSchedule } = require("../../lib/scheduler");
const { generateReport } = require("../../lib/reports");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    cors(res, req);
    return res.status(200).end();
  }

  const admin = getAdminFromReq(req);
  const apiKeyData = !admin ? await getClientFromApiKey(req) : null;
  if (!admin && !apiKeyData) return error(res, "Unauthorized", 401, req);

  // Parse path for ID-based routes
  const pathParts = req.path?.split("/").filter(Boolean) || [];
  const scheduleId = pathParts[0] || req.query?.id || req.params?.id;
  const action = pathParts[1]; // "run" for manual trigger

  // ----------------------------------------------------------------
  // GET /api/schedules - List all schedules
  // ----------------------------------------------------------------
  if (req.method === "GET" && !scheduleId) {
    let query = supabase
      .from("report_schedules")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter by ownership
    if (admin) {
      query = query.eq("created_by", admin.id);
    } else if (apiKeyData) {
      query = query.eq("client_id", apiKeyData.client_id);
    }

    const { data, error: dbErr } = await query;
    if (dbErr) return error(res, dbErr.message, 400, req);

    return json(res, { schedules: data, total: data.length }, 200, req);
  }

  // ----------------------------------------------------------------
  // POST /api/schedules/preview - Preview report without saving
  // ----------------------------------------------------------------
  if (req.method === "POST" && scheduleId === "preview") {
    const { report_type, date_range_type, tag_macs, custom_range_days } = req.body || {};

    if (!report_type) return error(res, "report_type is required", 400, req);

    try {
      const mockSchedule = {
        report_type,
        date_range_type: date_range_type || "last_24h",
        tag_macs: tag_macs || [],
        custom_range_days,
        timezone: "Asia/Taipei"
      };

      const reportData = await generateReport(mockSchedule);

      return json(res, {
        preview: {
          summary: reportData.summary,
          sample_data: reportData.excursions?.slice(0, 5) || reportData.events?.slice(0, 5) || [],
          period: reportData.period
        }
      }, 200, req);
    } catch (err) {
      return error(res, err.message, 400, req);
    }
  }

  // ----------------------------------------------------------------
  // POST /api/schedules - Create new schedule
  // ----------------------------------------------------------------
  if (req.method === "POST" && !scheduleId) {
    const {
      name,
      description,
      report_type,
      frequency,
      run_at_hour,
      run_at_minute,
      day_of_week,
      day_of_month,
      timezone,
      date_range_type,
      custom_range_days,
      tag_macs,
      geofence_ids,
      recipients,
      delivery_method
    } = req.body || {};

    // Validation
    if (!name) return error(res, "name is required", 400, req);
    if (!report_type) return error(res, "report_type is required", 400, req);
    if (!frequency) return error(res, "frequency is required", 400, req);
    if (run_at_hour === undefined || run_at_hour === null) {
      return error(res, "run_at_hour is required", 400, req);
    }

    // Build schedule object
    const schedule = {
      name,
      description: description || null,
      report_type,
      frequency,
      run_at_hour: parseInt(run_at_hour),
      run_at_minute: run_at_minute !== undefined ? parseInt(run_at_minute) : 0,
      day_of_week: day_of_week !== undefined ? parseInt(day_of_week) : null,
      day_of_month: day_of_month !== undefined ? parseInt(day_of_month) : null,
      timezone: timezone || "Asia/Taipei",
      date_range_type: date_range_type || "last_24h",
      custom_range_days: custom_range_days || null,
      tag_macs: tag_macs || [],
      geofence_ids: geofence_ids || [],
      recipients: recipients || [],
      delivery_method: delivery_method || "email",
      created_by: admin?.id || null,
      client_id: apiKeyData?.client_id || null,
      enabled: true
    };

    // Calculate next run time
    try {
      const nextRun = calculateNextRun(schedule);
      schedule.next_run_at = nextRun.toISO();
    } catch (err) {
      return error(res, "Failed to calculate next run time: " + err.message, 400, req);
    }

    // Insert schedule
    const { data, error: dbErr } = await supabase
      .from("report_schedules")
      .insert(schedule)
      .select()
      .single();

    if (dbErr) return error(res, dbErr.message, 400, req);

    return json(res, {
      id: data.id,
      name: data.name,
      next_run_at: data.next_run_at,
      message: "Schedule created successfully"
    }, 201, req);
  }

  // ----------------------------------------------------------------
  // GET /api/schedules/:id - Get single schedule
  // ----------------------------------------------------------------
  if (req.method === "GET" && scheduleId) {
    const { data: schedule, error: dbErr } = await supabase
      .from("report_schedules")
      .select("*")
      .eq("id", scheduleId)
      .single();

    if (dbErr || !schedule) return error(res, "Schedule not found", 404, req);

    // Verify ownership
    if (admin && schedule.created_by !== admin.id) {
      return error(res, "Not authorized", 403, req);
    }
    if (apiKeyData && schedule.client_id !== apiKeyData.client_id) {
      return error(res, "Not authorized", 403, req);
    }

    return json(res, schedule, 200, req);
  }

  // ----------------------------------------------------------------
  // POST /api/schedules/:id/run - Manually trigger schedule
  // ----------------------------------------------------------------
  if (req.method === "POST" && scheduleId && action === "run") {
    // Verify schedule exists and user has access
    const { data: schedule, error: fetchErr } = await supabase
      .from("report_schedules")
      .select("*")
      .eq("id", scheduleId)
      .single();

    if (fetchErr || !schedule) return error(res, "Schedule not found", 404, req);

    if (admin && schedule.created_by !== admin.id) {
      return error(res, "Not authorized", 403, req);
    }
    if (apiKeyData && schedule.client_id !== apiKeyData.client_id) {
      return error(res, "Not authorized", 403, req);
    }

    try {
      // Trigger async - don't wait for completion
      triggerSchedule(scheduleId).catch(err => {
        console.error(`[Scheduler] Manual trigger failed for ${scheduleId}:`, err);
      });

      return json(res, {
        message: "Report generation started",
        schedule_id: scheduleId
      }, 202, req);
    } catch (err) {
      return error(res, err.message, 500, req);
    }
  }

  // ----------------------------------------------------------------
  // PUT /api/schedules/:id - Update schedule
  // ----------------------------------------------------------------
  if (req.method === "PUT" && scheduleId) {
    // Verify schedule exists and user has access
    const { data: existing, error: fetchErr } = await supabase
      .from("report_schedules")
      .select("*")
      .eq("id", scheduleId)
      .single();

    if (fetchErr || !existing) return error(res, "Schedule not found", 404, req);

    if (admin && existing.created_by !== admin.id) {
      return error(res, "Not authorized", 403, req);
    }
    if (apiKeyData && existing.client_id !== apiKeyData.client_id) {
      return error(res, "Not authorized", 403, req);
    }

    // Build updates
    const updates = {};
    const allowedFields = [
      "name", "description", "report_type", "frequency",
      "run_at_hour", "run_at_minute", "day_of_week", "day_of_month",
      "timezone", "date_range_type", "custom_range_days",
      "tag_macs", "geofence_ids", "recipients", "delivery_method", "enabled"
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Recalculate next run if timing changed
    const timingChanged = ["frequency", "run_at_hour", "run_at_minute", "day_of_week", "day_of_month", "enabled"]
      .some(f => updates[f] !== undefined);

    if (timingChanged) {
      const merged = { ...existing, ...updates };
      if (merged.enabled) {
        try {
          const nextRun = calculateNextRun(merged);
          updates.next_run_at = nextRun.toISO();
        } catch (err) {
          return error(res, "Failed to calculate next run time: " + err.message, 400, req);
        }
      }
    }

    // Update
    const { data, error: updateErr } = await supabase
      .from("report_schedules")
      .update(updates)
      .eq("id", scheduleId)
      .select()
      .single();

    if (updateErr) return error(res, updateErr.message, 400, req);

    return json(res, data, 200, req);
  }

  // ----------------------------------------------------------------
  // DELETE /api/schedules/:id - Delete schedule
  // ----------------------------------------------------------------
  if (req.method === "DELETE" && scheduleId) {
    // Verify schedule exists and user has access
    const { data: existing, error: fetchErr } = await supabase
      .from("report_schedules")
      .select("*")
      .eq("id", scheduleId)
      .single();

    if (fetchErr || !existing) return error(res, "Schedule not found", 404, req);

    if (admin && existing.created_by !== admin.id) {
      return error(res, "Not authorized", 403, req);
    }
    if (apiKeyData && existing.client_id !== apiKeyData.client_id) {
      return error(res, "Not authorized", 403, req);
    }

    const { error: deleteErr } = await supabase
      .from("report_schedules")
      .delete()
      .eq("id", scheduleId);

    if (deleteErr) return error(res, deleteErr.message, 400, req);

    return json(res, { message: "Schedule deleted", id: scheduleId }, 200, req);
  }

  return error(res, "Method not allowed", 405, req);
};
