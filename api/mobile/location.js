/**
 * Mobile Location API
 * Phase 4: Mobile App - Driver Location Tracking & Nearby Tags
 */

const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { requireTenantAuth } = require("../../lib/auth-middleware");
const { json, error } = require("../../lib/auth");

/**
 * PUT /api/mobile/location
 * Update driver/user location for tracking
 */
router.put("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { latitude, longitude, accuracy, speed, heading, timestamp } = req.body;

  // Validate required fields
  if (latitude === undefined || longitude === undefined) {
    return error(res, "latitude and longitude are required", 400, req);
  }

  // Validate coordinate ranges
  if (latitude < -90 || latitude > 90) {
    return error(res, "latitude must be between -90 and 90", 400, req);
  }
  if (longitude < -180 || longitude > 180) {
    return error(res, "longitude must be between -180 and 180", 400, req);
  }

  try {
    // Store user location
    await supabase.from("user_locations").insert({
      user_id: user.id,
      client_id: user.client_id,
      latitude,
      longitude,
      accuracy: accuracy || null,
      speed: speed || null,
      heading: heading || null,
      recorded_at: timestamp || new Date().toISOString()
    });

    // Find nearby tags (within 500m by default)
    const radius = 500;
    const nearbyTags = await findNearbyTags(user.client_id, latitude, longitude, radius);

    json(res, {
      success: true,
      nearby_tags: nearbyTags
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Location update error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/mobile/location/nearby
 * Get tags near a geographic location
 * Query params: latitude, longitude, radius (meters, default 1000)
 */
router.get("/nearby", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { latitude, longitude, radius = 1000 } = req.query;

  // Validate required fields
  if (!latitude || !longitude) {
    return error(res, "latitude and longitude are required", 400, req);
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const rad = parseInt(radius, 10);

  // Validate coordinate ranges
  if (isNaN(lat) || lat < -90 || lat > 90) {
    return error(res, "latitude must be a number between -90 and 90", 400, req);
  }
  if (isNaN(lng) || lng < -180 || lng > 180) {
    return error(res, "longitude must be a number between -180 and 180", 400, req);
  }
  if (isNaN(rad) || rad < 1 || rad > 50000) {
    return error(res, "radius must be a number between 1 and 50000 meters", 400, req);
  }

  try {
    const nearbyTags = await findNearbyTags(user.client_id, lat, lng, rad);

    json(res, {
      tags: nearbyTags,
      total: nearbyTags.length
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Nearby tags error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * GET /api/mobile/location/history
 * Get user's location history
 * Query params: limit (default 100), since (ISO date)
 */
router.get("/history", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { limit = 100, since } = req.query;
  const limitNum = Math.min(parseInt(limit, 10) || 100, 1000);

  try {
    let query = supabase
      .from("user_locations")
      .select("latitude, longitude, accuracy, speed, heading, recorded_at")
      .eq("user_id", user.id)
      .order("recorded_at", { ascending: false })
      .limit(limitNum);

    if (since) {
      query = query.gte("recorded_at", since);
    }

    const { data: locations, error: queryError } = await query;

    if (queryError) throw queryError;

    json(res, {
      locations: locations || [],
      total: locations?.length || 0
    }, 200, req);

  } catch (err) {
    console.error("[Mobile] Location history error:", err);
    error(res, err.message, 500, req);
  }
});

/**
 * Find nearby tags using Haversine formula
 * This is a JavaScript implementation since the RPC function may not exist
 */
async function findNearbyTags(clientId, lat, lng, radiusMeters) {
  try {
    // First try to use the database function if it exists
    const { data: rpcTags, error: rpcError } = await supabase.rpc("find_nearby_tags", {
      p_lat: lat,
      p_lng: lng,
      p_radius_m: radiusMeters,
      p_client_id: clientId
    });

    if (!rpcError && rpcTags) {
      return rpcTags.map(tag => ({
        mac: tag.mac,
        name: tag.name || tag.mac,
        latitude: parseFloat(tag.latitude),
        longitude: parseFloat(tag.longitude),
        distance_m: Math.round(parseFloat(tag.distance_m)),
        temperature: tag.temperature ? parseFloat(tag.temperature) : null,
        status: tag.status,
        last_seen_at: tag.last_seen_at
      }));
    }
  } catch (rpcErr) {
    // RPC function doesn't exist, fall back to manual calculation
    console.log("[Mobile] RPC not available, using manual calculation");
  }

  // Fallback: client_tags and sensor_data have no latitude/longitude columns.
  // Distance filtering is impossible without coordinate data.
  console.warn("[Mobile] findNearbyTags fallback: no lat/lng in client_tags or sensor_data. Returning empty array. Deploy the find_nearby_tags RPC or add coordinate columns.");
  return [];
}

module.exports = router;
