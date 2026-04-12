/**
 * Mobile Device Registration API
 * Phase 4: Mobile App - Push Notifications
 */

const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { requireTenantAuth, logAudit, getClientIP } = require("../../lib/auth-middleware");
const { json, error } = require("../../lib/auth");

/**
 * POST /api/mobile/register-device
 * Register FCM token for push notifications
 */
router.post("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { fcm_token, device_id, device_type, device_name, os_version, app_version } = req.body;

  // Validate required fields
  if (!fcm_token || !device_id) {
    return error(res, "fcm_token and device_id are required", 400, req);
  }

  // Validate device_type if provided
  const validDeviceTypes = ["ios", "android", "unknown"];
  const normalizedDeviceType = device_type ? device_type.toLowerCase() : "unknown";
  if (!validDeviceTypes.includes(normalizedDeviceType)) {
    return error(res, "Invalid device_type. Must be 'ios', 'android', or 'unknown'", 400, req);
  }

  try {
    // Check if device already exists for this user
    const { data: existingDevice } = await supabase
      .from("mobile_devices")
      .select("id, fcm_token")
      .eq("device_id", device_id)
      .single();

    let device;

    if (existingDevice) {
      // Update existing device registration
      const { data: updatedDevice, error: updateError } = await supabase
        .from("mobile_devices")
        .update({
          user_id: user.id,
          client_id: user.client_id,
          fcm_token,
          device_type: normalizedDeviceType,
          device_name: device_name || null,
          os_version: os_version || null,
          app_version: app_version || null,
          last_active_at: new Date().toISOString(),
          status: "active",
          updated_at: new Date().toISOString()
        })
        .eq("id", existingDevice.id)
        .select()
        .single();

      if (updateError) throw updateError;
      device = updatedDevice;
    } else {
      // Create new device registration
      const { data: newDevice, error: insertError } = await supabase
        .from("mobile_devices")
        .insert({
          user_id: user.id,
          client_id: user.client_id,
          device_id,
          fcm_token,
          device_type: normalizedDeviceType,
          device_name: device_name || null,
          os_version: os_version || null,
          app_version: app_version || null,
          last_active_at: new Date().toISOString(),
          status: "active"
        })
        .select()
        .single();

      if (insertError) throw insertError;
      device = newDevice;
    }

    // Initialize notification preferences if not exists
    const { data: existingPrefs } = await supabase
      .from("notification_preferences")
      .select("user_id")
      .eq("user_id", user.id)
      .single();

    if (!existingPrefs) {
      await supabase.from("notification_preferences").insert({
        user_id: user.id,
        push_enabled: true,
        sos_enabled: true,
        temperature_enabled: true,
        geofence_enabled: true,
        battery_enabled: false,
        offline_enabled: false,
        task_enabled: true,
        quiet_hours_enabled: false,
        assigned_tags_only: false
      });
    }

    // Log audit entry
    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      action: existingDevice ? "update_device" : "register_device",
      resource: "mobile_devices",
      target_type: "mobile_device",
      target_id: device.id,
      new_values: { device_id, device_type: normalizedDeviceType, device_name },
      ip_address: getClientIP(req),
      user_agent: req.headers["user-agent"]
    });

    json(res, {
      success: true,
      device: {
        id: device.id,
        registered_at: device.created_at
      }
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Device registration error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * DELETE /api/mobile/register-device
 * Unregister device (logout)
 */
router.delete("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { device_id } = req.body;

  if (!device_id) {
    return error(res, "device_id is required", 400, req);
  }

  try {
    const { data: device, error: updateError } = await supabase
      .from("mobile_devices")
      .update({ status: "inactive" })
      .eq("device_id", device_id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError && updateError.code !== "PGRST116") {
      throw updateError;
    }

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      action: "unregister_device",
      resource: "mobile_devices",
      target_type: "mobile_device",
      target_id: device?.id,
      ip_address: getClientIP(req)
    });

    json(res, { success: true }, 200, req);

  } catch (err) {
    console.error("[Mobile] Device unregistration error:", err);
    error(res, err.message, 500, req);
  }
});

module.exports = router;
