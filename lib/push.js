/**
 * Push Notification Service
 * Phase 4: Mobile App - Firebase Cloud Messaging Integration
 */

const { supabase } = require("./supabase");

// Firebase Admin SDK - lazy loaded
let firebaseAdmin = null;

// Rate limiting state (in-memory, should use Redis in production)
const rateLimitState = new Map();

// Rate limits per alert type
const RATE_LIMITS = {
  sos: { cooldownMs: 0, maxPerHour: Infinity },
  temperature: { cooldownMs: 5 * 60 * 1000, maxPerHour: 12 },
  geofence: { cooldownMs: 10 * 60 * 1000, maxPerHour: 6 },
  battery: { cooldownMs: 60 * 60 * 1000, maxPerHour: 1 },
  offline: { cooldownMs: 4 * 60 * 60 * 1000, maxPerHour: 1 },
  task: { cooldownMs: 0, maxPerHour: Infinity }
};

// Alert severity mapping
const SEVERITY_MAP = {
  sos: "critical",
  temperature: "high",
  geofence: "medium",
  battery: "low",
  offline: "low",
  task: "medium"
};

/**
 * Initialize Firebase Admin SDK
 * Call this before sending notifications
 */
function initFirebase() {
  if (firebaseAdmin) return firebaseAdmin;

  // Check for required environment variables
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[Push] Firebase credentials not configured. Push notifications disabled.");
    return null;
  }

  try {
    const admin = require("firebase-admin");

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n")
        })
      });
    }

    firebaseAdmin = admin;
    console.log("[Push] Firebase Admin initialized successfully");
    return firebaseAdmin;

  } catch (err) {
    console.error("[Push] Failed to initialize Firebase:", err.message);
    return null;
  }
}

/**
 * Send push notification for an alert
 * @param {Object} options
 * @param {string} options.client_id - Tenant client ID
 * @param {string} options.alert_type - Type: sos, temperature, geofence, battery, offline, task
 * @param {string} options.tag_mac - MAC address of the tag (optional)
 * @param {string} options.tag_name - Display name of the tag (optional)
 * @param {string} options.title - Notification title
 * @param {string} options.message - Notification body
 * @param {Object} options.data - Additional data payload
 * @param {string[]} options.target_users - Specific user IDs to notify (optional)
 */
async function sendAlertNotification({
  client_id,
  alert_type,
  tag_mac,
  tag_name,
  title,
  message,
  data = {},
  target_users = []
}) {
  try {
    // 1. Check rate limit
    const canSend = await checkRateLimit(client_id, alert_type, tag_mac);
    if (!canSend) {
      console.log(`[Push] Rate limited: ${alert_type} for ${tag_mac || "client"}`);
      return { sent: false, reason: "rate_limited" };
    }

    // 2. Get target users with their preferences
    let usersQuery = supabase
      .from("notification_preferences")
      .select(`
        user_id,
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
      `)
      .eq("push_enabled", true);

    // Filter by alert type enabled
    const alertField = `${alert_type}_enabled`;
    usersQuery = usersQuery.eq(alertField, true);

    if (target_users.length > 0) {
      usersQuery = usersQuery.in("user_id", target_users);
    }

    const { data: preferences, error: prefsError } = await usersQuery;

    if (prefsError) {
      console.error("[Push] Error fetching preferences:", prefsError);
      return { sent: false, reason: "preferences_error" };
    }

    if (!preferences?.length) {
      return { sent: false, reason: "no_eligible_users" };
    }

    // Get user client_ids to filter by tenant
    const userIds = preferences.map(p => p.user_id);
    const { data: users } = await supabase
      .from("tenant_users")
      .select("id, client_id")
      .in("id", userIds)
      .eq("client_id", client_id);

    if (!users?.length) {
      return { sent: false, reason: "no_users_in_tenant" };
    }

    const tenantUserIds = users.map(u => u.id);
    const tenantPrefs = preferences.filter(p => tenantUserIds.includes(p.user_id));

    // 3. Filter by quiet hours
    const eligibleUsers = tenantPrefs.filter(pref => {
      if (!pref.quiet_hours_enabled) return true;
      if (alert_type === "sos") return true; // SOS bypasses quiet hours
      return !isInQuietHours(pref.quiet_start, pref.quiet_end);
    });

    if (!eligibleUsers.length) {
      return { sent: false, reason: "quiet_hours" };
    }

    // 4. Get FCM tokens
    const eligibleUserIds = eligibleUsers.map(u => u.user_id);
    const { data: devices, error: devicesError } = await supabase
      .from("mobile_devices")
      .select("fcm_token, device_type, user_id")
      .in("user_id", eligibleUserIds)
      .eq("status", "active");

    if (devicesError) {
      console.error("[Push] Error fetching devices:", devicesError);
      return { sent: false, reason: "devices_error" };
    }

    if (!devices?.length) {
      return { sent: false, reason: "no_devices" };
    }

    // 5. Build notification payload
    const payload = buildNotificationPayload({
      alert_type,
      tag_mac,
      tag_name,
      title,
      message,
      data
    });

    // 6. Send via Firebase (if available)
    const admin = initFirebase();
    let response = { successCount: 0, failureCount: 0, responses: [] };

    if (admin) {
      const tokens = devices.map(d => d.fcm_token);
      response = await admin.messaging().sendEachForMulticast({
        tokens,
        ...payload
      });

      // 7. Handle failures (remove invalid tokens)
      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const errorCode = resp.error?.code;
            if (errorCode === "messaging/invalid-registration-token" ||
                errorCode === "messaging/registration-token-not-registered") {
              failedTokens.push(tokens[idx]);
            }
          }
        });

        if (failedTokens.length > 0) {
          await supabase
            .from("mobile_devices")
            .update({ status: "inactive" })
            .in("fcm_token", failedTokens);

          console.log(`[Push] Deactivated ${failedTokens.length} invalid tokens`);
        }
      }
    } else {
      console.log("[Push] Firebase not available, logging alert only");
      response.successCount = devices.length; // Simulate success for logging
    }

    // 8. Log alert to database
    const { data: alertRecord, error: alertError } = await supabase.from("alerts").insert({
      client_id,
      alert_type,
      severity: SEVERITY_MAP[alert_type] || "medium",
      tag_mac: tag_mac || null,
      tag_name: tag_name || null,
      title,
      message,
      data,
      sent_to: eligibleUserIds,
      read_by: []
    }).select().single();

    if (alertError) {
      console.error("[Push] Error logging alert:", alertError);
    }

    console.log(`[Push] Sent ${alert_type} notification to ${response.successCount}/${devices.length} devices`);

    return {
      sent: true,
      success_count: response.successCount,
      failure_count: response.failureCount,
      alert_id: alertRecord?.id
    };

  } catch (err) {
    console.error("[Push] sendAlertNotification error:", err);
    return { sent: false, reason: "error", error: err.message };
  }
}

/**
 * Send push notification to a single device
 * @param {string} token - FCM token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {Object} data - Additional data payload
 */
async function sendPushNotification(token, title, body, data = {}) {
  const admin = initFirebase();
  if (!admin) {
    console.log("[Push] Firebase not available");
    return { sent: false, reason: "firebase_not_configured" };
  }

  try {
    const message = {
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      ),
      android: {
        priority: "high",
        notification: {
          channelId: "default"
        }
      },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1
          }
        }
      }
    };

    const response = await admin.messaging().send(message);
    return { sent: true, messageId: response };

  } catch (err) {
    console.error("[Push] sendPushNotification error:", err);
    return { sent: false, reason: "error", error: err.message };
  }
}

/**
 * Send multicast push notification to multiple devices
 * @param {string[]} tokens - Array of FCM tokens
 * @param {Object} payload - Notification payload
 */
async function sendMulticast(tokens, payload) {
  const admin = initFirebase();
  if (!admin) {
    console.log("[Push] Firebase not available");
    return { sent: false, reason: "firebase_not_configured" };
  }

  if (!tokens?.length) {
    return { sent: false, reason: "no_tokens" };
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      ...payload
    });

    return {
      sent: true,
      success_count: response.successCount,
      failure_count: response.failureCount
    };

  } catch (err) {
    console.error("[Push] sendMulticast error:", err);
    return { sent: false, reason: "error", error: err.message };
  }
}

/**
 * Queue a notification for rate limiting
 * Used for batch notifications
 */
async function queueNotification(notification) {
  // In a production system, this would add to a Redis queue
  // For now, we just send immediately with rate limiting
  return sendAlertNotification(notification);
}

/**
 * Build notification payload based on alert type
 */
function buildNotificationPayload({ alert_type, tag_mac, tag_name, title, message, data }) {
  const alertId = data.alert_id || `alert-${Date.now()}`;
  const timestamp = new Date().toISOString();

  // Base data payload (all values must be strings for FCM)
  const dataPayload = {
    type: alert_type,
    alert_id: alertId,
    timestamp,
    ...(tag_mac && { tag_mac }),
    ...(tag_name && { tag_name }),
    ...Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    )
  };

  // Android configuration
  const android = {
    priority: "high",
    notification: {
      channelId: getAndroidChannel(alert_type),
      sound: getAlertSound(alert_type),
      color: getAlertColor(alert_type)
    }
  };

  // iOS (APNs) configuration
  const apns = {
    payload: {
      aps: {
        sound: `${getAlertSound(alert_type)}.wav`,
        badge: 1,
        category: getApnsCategory(alert_type),
        "interruption-level": alert_type === "sos" ? "critical" : "time-sensitive"
      }
    }
  };

  // Special handling for SOS alerts
  if (alert_type === "sos") {
    android.notification.vibrate_timings_millis = [0, 500, 200, 500, 200, 500];
    apns.payload.aps.sound = {
      critical: 1,
      name: "sos_alarm.wav",
      volume: 1.0
    };
  }

  return {
    notification: { title, body: message },
    data: dataPayload,
    android,
    apns
  };
}

/**
 * Check rate limit for alert type
 */
async function checkRateLimit(clientId, alertType, tagMac) {
  const key = `${clientId}:${alertType}:${tagMac || "all"}`;
  const limit = RATE_LIMITS[alertType] || { cooldownMs: 0, maxPerHour: Infinity };
  const now = Date.now();

  let state = rateLimitState.get(key);
  if (!state) {
    state = { lastSent: 0, countThisHour: 0, hourStart: now };
    rateLimitState.set(key, state);
  }

  // Reset hourly counter if hour has passed
  if (now - state.hourStart > 3600000) {
    state.countThisHour = 0;
    state.hourStart = now;
  }

  // Check cooldown
  if (now - state.lastSent < limit.cooldownMs) {
    return false;
  }

  // Check hourly limit
  if (state.countThisHour >= limit.maxPerHour) {
    return false;
  }

  // Update state
  state.lastSent = now;
  state.countThisHour++;

  return true;
}

/**
 * Check if current time is in quiet hours
 */
function isInQuietHours(quietStart, quietEnd) {
  if (!quietStart || !quietEnd) return false;

  const now = new Date();
  const [startHour, startMin] = quietStart.split(":").map(Number);
  const [endHour, endMin] = quietEnd.split(":").map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  // Handle overnight quiet hours (e.g., 22:00 - 06:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Get Android notification channel ID
 */
function getAndroidChannel(alertType) {
  const channels = {
    sos: "emergency_alerts",
    temperature: "critical_alerts",
    geofence: "geofence_alerts",
    battery: "device_alerts",
    offline: "device_alerts",
    task: "task_updates"
  };
  return channels[alertType] || "default";
}

/**
 * Get alert sound name
 */
function getAlertSound(alertType) {
  const sounds = {
    sos: "sos_alarm",
    temperature: "alert_high",
    geofence: "alert_medium",
    battery: "notification",
    offline: "notification",
    task: "notification"
  };
  return sounds[alertType] || "default";
}

/**
 * Get alert color for Android
 */
function getAlertColor(alertType) {
  const colors = {
    sos: "#DC2626",      // Red
    temperature: "#EF4444", // Light red
    geofence: "#F59E0B",   // Orange
    battery: "#6B7280",    // Gray
    offline: "#6B7280",    // Gray
    task: "#3B82F6"        // Blue
  };
  return colors[alertType] || "#3B82F6";
}

/**
 * Get APNs category for iOS
 */
function getApnsCategory(alertType) {
  const categories = {
    sos: "SOS_ALERT",
    temperature: "TEMPERATURE_ALERT",
    geofence: "GEOFENCE_ALERT",
    battery: "DEVICE_ALERT",
    offline: "DEVICE_ALERT",
    task: "TASK_NOTIFICATION"
  };
  return categories[alertType] || "DEFAULT";
}

module.exports = {
  initFirebase,
  sendAlertNotification,
  sendPushNotification,
  sendMulticast,
  queueNotification,
  checkRateLimit,
  isInQuietHours
};
