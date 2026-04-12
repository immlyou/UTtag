/**
 * Mobile Offline Sync API
 * Phase 4: Mobile App - Offline Data Synchronization
 */

const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { requireTenantAuth, logAudit, getClientIP } = require("../../lib/auth-middleware");
const { json, error } = require("../../lib/auth");

/**
 * POST /api/mobile/sync
 * Handle offline data sync
 * Returns deltas since last sync and processes pending changes
 */
router.post("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { last_sync_at, pending_changes } = req.body;
  const syncTimestamp = new Date().toISOString();
  const conflicts = [];
  const processed = { tasks: 0, scans: 0 };

  try {
    // 1. Process pending changes from client
    if (pending_changes?.tasks?.length) {
      for (const change of pending_changes.tasks) {
        await processTaskChange(user, change, conflicts);
        processed.tasks++;
      }
    }

    if (pending_changes?.scans?.length) {
      // Batch insert scans
      const scanRecords = pending_changes.scans.map(scan => ({
        mac: scan.mac,
        user_id: user.id,
        client_id: user.client_id,
        latitude: scan.latitude || null,
        longitude: scan.longitude || null,
        scanned_at: scan.scanned_at || new Date().toISOString()
      }));

      const { error: scanError } = await supabase
        .from("scan_history")
        .insert(scanRecords);

      if (!scanError) {
        processed.scans = scanRecords.length;
      }
    }

    // 2. Fetch server changes since last sync
    const lastSync = last_sync_at || new Date(0).toISOString();
    const changes = await fetchServerChanges(user, lastSync);

    // 3. Log sync activity
    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      action: "sync",
      resource: "mobile_sync",
      metadata: {
        last_sync_at: lastSync,
        processed,
        changes_received: {
          tags: changes.tags.updated.length,
          tasks: changes.tasks.created.length + changes.tasks.updated.length,
          alerts: changes.alerts.created.length
        },
        conflicts_count: conflicts.length
      },
      ip_address: getClientIP(req)
    });

    json(res, {
      success: true,
      sync_timestamp: syncTimestamp,
      changes,
      conflicts
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Sync error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/mobile/sync/status
 * Get sync status and pending changes count
 */
router.get("/status", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  try {
    // Get last device activity
    const { data: device } = await supabase
      .from("mobile_devices")
      .select("last_active_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("last_active_at", { ascending: false })
      .limit(1)
      .single();

    // Get pending counts
    const { count: pendingTasks } = await supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("client_id", user.client_id)
      .eq("assigned_to", user.id)
      .in("status", ["pending", "in_progress"]);

    const { count: unreadAlerts } = await supabase
      .from("alerts")
      .select("*", { count: "exact", head: true })
      .eq("client_id", user.client_id)
      .not("read_by", "cs", `{${user.id}}`);

    json(res, {
      last_sync_at: device?.last_active_at || null,
      pending: {
        tasks: pendingTasks || 0,
        unread_alerts: unreadAlerts || 0
      }
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Sync status error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * Process a task change from client
 */
async function processTaskChange(user, change, conflicts) {
  const { id, server_id, action, data } = change;

  if (action === "create" && !server_id) {
    // New task created offline
    const { data: newTask, error: createError } = await supabase
      .from("tasks")
      .insert({
        ...data,
        client_id: user.client_id,
        created_by: user.id
      })
      .select()
      .single();

    if (createError) {
      conflicts.push({
        entity: "task",
        id,
        error: createError.message,
        resolution: "failed"
      });
    }

    return newTask;
  }

  if (action === "update" && server_id) {
    // Check for conflicts
    const { data: serverTask } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", server_id)
      .eq("client_id", user.client_id)
      .single();

    if (!serverTask) {
      conflicts.push({
        entity: "task",
        id: server_id,
        error: "Task not found",
        resolution: "failed"
      });
      return null;
    }

    // Check if server version is newer
    if (data.updated_at && new Date(serverTask.updated_at) > new Date(data.updated_at)) {
      // Conflict detected - server wins by default
      conflicts.push({
        entity: "task",
        id: server_id,
        server_version: serverTask,
        client_version: data,
        resolution: "server_wins"
      });
      return serverTask;
    }

    // Apply client changes
    const { data: updatedTask, error: updateError } = await supabase
      .from("tasks")
      .update({
        ...data,
        updated_at: new Date().toISOString()
      })
      .eq("id", server_id)
      .eq("client_id", user.client_id)
      .select()
      .single();

    if (updateError) {
      conflicts.push({
        entity: "task",
        id: server_id,
        error: updateError.message,
        resolution: "failed"
      });
    }

    return updatedTask;
  }

  if (action === "delete" && server_id) {
    await supabase
      .from("tasks")
      .update({ status: "cancelled" })
      .eq("id", server_id)
      .eq("client_id", user.client_id);
  }

  return null;
}

/**
 * Fetch all server changes since last sync
 */
async function fetchServerChanges(user, lastSync) {
  const changes = {
    tags: { created: [], updated: [], deleted: [] },
    tasks: { created: [], updated: [], deleted: [] },
    alerts: { created: [], updated: [], deleted: [] }
  };

  // Get updated tags with latest sensor data
  const { data: clientTags } = await supabase
    .from("client_tags")
    .select("mac, label, created_at")
    .eq("client_id", user.client_id)
    .gt("created_at", lastSync);

  if (clientTags) {
    // Get latest sensor data for these tags
    const macs = clientTags.map(t => t.mac);
    const { data: sensorData } = await supabase
      .from("sensor_data")
      .select("mac, temperature, humidity, created_at")
      .in("mac", macs)
      .order("created_at", { ascending: false });

    // Get latest per mac
    const latestSensor = {};
    for (const d of sensorData || []) {
      if (!latestSensor[d.mac]) {
        latestSensor[d.mac] = d;
      }
    }

    changes.tags.updated = clientTags.map(tag => ({
      mac: tag.mac,
      label: tag.label,
      temperature: latestSensor[tag.mac]?.temperature || null,
      humidity: latestSensor[tag.mac]?.humidity || null,
      last_seen_at: latestSensor[tag.mac]?.created_at || null
    }));
  }

  // Get updated/created tasks
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("client_id", user.client_id)
    .or(`assigned_to.eq.${user.id},created_by.eq.${user.id}`)
    .gt("updated_at", lastSync);

  if (tasks) {
    for (const task of tasks) {
      if (new Date(task.created_at) > new Date(lastSync)) {
        changes.tasks.created.push(task);
      } else {
        changes.tasks.updated.push(task);
      }
    }
  }

  // Get new alerts
  const { data: alerts } = await supabase
    .from("alerts")
    .select("*")
    .eq("client_id", user.client_id)
    .gt("created_at", lastSync)
    .order("created_at", { ascending: false })
    .limit(100);

  if (alerts) {
    changes.alerts.created = alerts;
  }

  return changes;
}

module.exports = router;
