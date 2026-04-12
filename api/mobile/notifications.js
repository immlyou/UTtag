/**
 * Mobile Notification Preferences API
 * Phase 4: Mobile App - Push Notification Settings
 */

const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { requireTenantAuth, logAudit, getClientIP } = require("../../lib/auth-middleware");
const { json, error } = require("../../lib/auth");

/**
 * GET /api/mobile/notifications
 * Get notification preferences for current user
 */
router.get("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  try {
    const { data: prefs, error: queryError } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (queryError && queryError.code !== "PGRST116") {
      throw queryError;
    }

    // Return defaults if no preferences exist
    const defaultPrefs = {
      push_enabled: true,
      sos_enabled: true,
      temperature_enabled: true,
      geofence_enabled: true,
      battery_enabled: false,
      offline_enabled: false,
      task_enabled: true,
      quiet_hours_enabled: false,
      quiet_start: null,
      quiet_end: null,
      assigned_tags_only: false
    };

    json(res, {
      preferences: prefs || defaultPrefs
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Get notifications error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * PUT /api/mobile/notifications
 * Update notification preferences
 */
router.put("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const {
    push_enabled,
    sos_enabled,
    temperature_enabled,
    geofence_enabled,
    battery_enabled,
    offline_enabled,
    task_enabled,
    quiet_hours_enabled,
    quiet_start,
    quiet_end,
    assigned_tags_only
  } = req.body;

  // Build update object with only provided fields
  const updates = {};
  if (push_enabled !== undefined) updates.push_enabled = push_enabled;
  if (sos_enabled !== undefined) updates.sos_enabled = sos_enabled;
  if (temperature_enabled !== undefined) updates.temperature_enabled = temperature_enabled;
  if (geofence_enabled !== undefined) updates.geofence_enabled = geofence_enabled;
  if (battery_enabled !== undefined) updates.battery_enabled = battery_enabled;
  if (offline_enabled !== undefined) updates.offline_enabled = offline_enabled;
  if (task_enabled !== undefined) updates.task_enabled = task_enabled;
  if (quiet_hours_enabled !== undefined) updates.quiet_hours_enabled = quiet_hours_enabled;
  if (quiet_start !== undefined) updates.quiet_start = quiet_start;
  if (quiet_end !== undefined) updates.quiet_end = quiet_end;
  if (assigned_tags_only !== undefined) updates.assigned_tags_only = assigned_tags_only;

  if (Object.keys(updates).length === 0) {
    return error(res, "No preferences to update", 400, req);
  }

  // Validate quiet hours if provided
  if (updates.quiet_start || updates.quiet_end) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (updates.quiet_start && !timeRegex.test(updates.quiet_start)) {
      return error(res, "quiet_start must be in HH:MM format", 400, req);
    }
    if (updates.quiet_end && !timeRegex.test(updates.quiet_end)) {
      return error(res, "quiet_end must be in HH:MM format", 400, req);
    }
  }

  updates.updated_at = new Date().toISOString();

  try {
    // Get existing preferences
    const { data: existing } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .single();

    let prefs;

    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from("notification_preferences")
        .update(updates)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) throw updateError;
      prefs = updated;
    } else {
      // Insert new with defaults
      const newPrefs = {
        user_id: user.id,
        push_enabled: true,
        sos_enabled: true,
        temperature_enabled: true,
        geofence_enabled: true,
        battery_enabled: false,
        offline_enabled: false,
        task_enabled: true,
        quiet_hours_enabled: false,
        assigned_tags_only: false,
        ...updates
      };

      const { data: inserted, error: insertError } = await supabase
        .from("notification_preferences")
        .insert(newPrefs)
        .select()
        .single();

      if (insertError) throw insertError;
      prefs = inserted;
    }

    // Log audit
    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      action: "update_notification_preferences",
      resource: "notification_preferences",
      old_values: existing,
      new_values: updates,
      ip_address: getClientIP(req)
    });

    json(res, {
      success: true,
      preferences: prefs
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Update notifications error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/mobile/notifications/history
 * Get notification/alert history
 * Query params: limit, offset, type
 */
router.get("/history", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { limit = 50, offset = 0, type } = req.query;
  const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
  const offsetNum = parseInt(offset, 10) || 0;

  try {
    let query = supabase
      .from("alerts")
      .select("*", { count: "exact" })
      .eq("client_id", user.client_id)
      .order("created_at", { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (type) {
      query = query.eq("alert_type", type);
    }

    const { data: alerts, count, error: queryError } = await query;

    if (queryError) throw queryError;

    // Mark read status for each alert
    const alertsWithReadStatus = (alerts || []).map(alert => ({
      ...alert,
      is_read: (alert.read_by || []).includes(user.id)
    }));

    json(res, {
      alerts: alertsWithReadStatus,
      total: count || 0,
      limit: limitNum,
      offset: offsetNum
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Notification history error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/mobile/notifications/:id/read
 * Mark a notification as read
 */
router.post("/:id/read", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { id } = req.params;

  try {
    // Get current alert
    const { data: alert, error: getError } = await supabase
      .from("alerts")
      .select("read_by")
      .eq("id", id)
      .eq("client_id", user.client_id)
      .single();

    if (getError) {
      return error(res, "Alert not found", 404, req);
    }

    // Add user to read_by if not already present
    const readBy = alert.read_by || [];
    if (!readBy.includes(user.id)) {
      readBy.push(user.id);

      await supabase
        .from("alerts")
        .update({ read_by: readBy })
        .eq("id", id);
    }

    json(res, { success: true }, 200, req);

  } catch (err) {
    console.error("[Mobile] Mark read error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * POST /api/mobile/notifications/read-all
 * Mark all notifications as read
 */
router.post("/read-all", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  try {
    // Get all unread alerts for this client
    const { data: alerts } = await supabase
      .from("alerts")
      .select("id, read_by")
      .eq("client_id", user.client_id);

    // Update each alert that hasn't been read by this user
    let updated = 0;
    for (const alert of alerts || []) {
      const readBy = alert.read_by || [];
      if (!readBy.includes(user.id)) {
        readBy.push(user.id);
        await supabase
          .from("alerts")
          .update({ read_by: readBy })
          .eq("id", alert.id);
        updated++;
      }
    }

    json(res, { success: true, updated }, 200, req);

  } catch (err) {
    console.error("[Mobile] Mark all read error:", err);
    error(res, err.message, 500, req);
  }
});

module.exports = router;
