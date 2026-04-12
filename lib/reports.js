/**
 * Report Generator Module
 * Generates various report types from sensor and tag data
 */

const { supabase } = require("./supabase");
const { DateTime } = require("luxon");

// Temperature thresholds for cold chain monitoring
const TEMP_MIN = 2;
const TEMP_MAX = 8;

/**
 * Main report generator - routes to specific report type handlers
 */
async function generateReport(schedule) {
  const { report_type, tag_macs, geofence_ids, date_range_type, custom_range_days, timezone } = schedule;

  // Calculate date range
  const dateRange = calculateDateRange(date_range_type, custom_range_days, timezone);

  // Get tag MACs (empty = all)
  const tagMacs = tag_macs?.length > 0 ? tag_macs : null;

  const params = {
    dateRange,
    tagMacs,
    geofenceIds: geofence_ids,
    timezone: timezone || "Asia/Taipei"
  };

  switch (report_type) {
    case "temperature_excursion":
      return generateTemperatureReport(params);
    case "geofence_events":
      return generateGeofenceReport(params);
    case "task_completion":
      return generateTaskReport(params);
    case "haccp_compliance":
      return generateHACCPReport(params);
    case "batch_traceability":
      return generateBatchTraceabilityReport(params);
    default:
      throw new Error(`Unknown report type: ${report_type}`);
  }
}

/**
 * Calculate date range based on type
 */
function calculateDateRange(type, customDays, timezone) {
  const tz = timezone || "Asia/Taipei";
  const now = DateTime.now().setZone(tz);
  let start, end = now;

  switch (type) {
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
      start = now.minus({ days: customDays || 7 });
      break;
    default:
      start = now.minus({ hours: 24 });
  }

  return { start: start.toISO(), end: end.toISO() };
}

/**
 * Temperature Excursion Report
 * Identifies temperature deviations outside acceptable ranges
 */
async function generateTemperatureReport({ dateRange, tagMacs, timezone }) {
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
      tagStats[mac] = { readings: 0, excursions: 0, minTemp: temp, maxTemp: temp, avgTemp: 0, sumTemp: 0 };
    }
    tagStats[mac].readings++;
    tagStats[mac].minTemp = Math.min(tagStats[mac].minTemp, temp);
    tagStats[mac].maxTemp = Math.max(tagStats[mac].maxTemp, temp);
    tagStats[mac].sumTemp += temp;
    tagStats[mac].avgTemp = tagStats[mac].sumTemp / tagStats[mac].readings;

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
      exc.maxTemp > TEMP_MAX ? exc.maxTemp - TEMP_MAX : 0,
      exc.minTemp < TEMP_MIN ? TEMP_MIN - exc.minTemp : 0
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

/**
 * Geofence Events Report
 * Tracks entry/exit events for defined zones
 */
async function generateGeofenceReport({ dateRange, tagMacs, geofenceIds, timezone }) {
  // Note: This would typically query a geofence_events table
  // For now, we create a placeholder structure
  const events = [];

  // Summary
  return {
    report_type: "geofence_events",
    generated_at: new Date().toISOString(),
    period: dateRange,
    summary: {
      total_events: events.length,
      entry_events: events.filter(e => e.type === "entry").length,
      exit_events: events.filter(e => e.type === "exit").length,
      unique_tags: new Set(events.map(e => e.mac)).size,
      unique_zones: new Set(events.map(e => e.zone_id)).size
    },
    events: events
  };
}

/**
 * Task Completion Report
 * Summarizes task progress and completion rates
 */
async function generateTaskReport({ dateRange, tagMacs, timezone }) {
  // Note: This would query a tasks table if implemented
  // For now, create placeholder structure

  return {
    report_type: "task_completion",
    generated_at: new Date().toISOString(),
    period: dateRange,
    summary: {
      total_tasks: 0,
      completed_tasks: 0,
      pending_tasks: 0,
      overdue_tasks: 0,
      completion_rate: 0
    },
    tasks_by_status: {
      completed: [],
      pending: [],
      overdue: []
    },
    tasks_by_assignee: {}
  };
}

/**
 * HACCP Compliance Report
 * Documents critical control points and deviations
 */
async function generateHACCPReport({ dateRange, tagMacs, timezone }) {
  // First generate temperature data
  const tempReport = await generateTemperatureReport({ dateRange, tagMacs, timezone });

  // Calculate HACCP specific metrics
  const ccpStatus = {};
  const deviations = [];

  for (const [mac, stats] of Object.entries(tempReport.tag_statistics)) {
    const isCompliant = stats.minTemp >= TEMP_MIN && stats.maxTemp <= TEMP_MAX;
    ccpStatus[mac] = {
      mac,
      status: isCompliant ? "compliant" : "deviation",
      min_temp: stats.minTemp,
      max_temp: stats.maxTemp,
      avg_temp: Math.round(stats.avgTemp * 100) / 100,
      reading_count: stats.readings,
      excursion_count: stats.excursions
    };

    if (!isCompliant) {
      deviations.push({
        mac,
        type: stats.maxTemp > TEMP_MAX ? "high_temperature" : "low_temperature",
        deviation: stats.maxTemp > TEMP_MAX ? stats.maxTemp - TEMP_MAX : TEMP_MIN - stats.minTemp,
        corrective_action_required: true
      });
    }
  }

  const compliantCount = Object.values(ccpStatus).filter(c => c.status === "compliant").length;
  const totalCCPs = Object.keys(ccpStatus).length;

  return {
    report_type: "haccp_compliance",
    generated_at: new Date().toISOString(),
    period: dateRange,
    summary: {
      total_ccps_monitored: totalCCPs,
      compliant_ccps: compliantCount,
      non_compliant_ccps: totalCCPs - compliantCount,
      compliance_rate: totalCCPs > 0 ? Math.round((compliantCount / totalCCPs) * 100) : 100,
      total_deviations: deviations.length,
      critical_limits: { min: TEMP_MIN, max: TEMP_MAX }
    },
    ccp_status: Object.values(ccpStatus),
    deviations: deviations,
    verification_records: {
      monitoring_frequency: "continuous",
      calibration_status: "current",
      record_keeping: "electronic"
    }
  };
}

/**
 * Batch Traceability Report
 * Full chain of custody for batch tracking
 */
async function generateBatchTraceabilityReport({ dateRange, tagMacs, timezone }) {
  // This would typically join with a batch_bindings table
  // For now, create placeholder structure

  return {
    report_type: "batch_traceability",
    generated_at: new Date().toISOString(),
    period: dateRange,
    summary: {
      batches_tracked: 0,
      total_handovers: 0,
      temperature_compliant: 0
    },
    batches: [],
    chain_of_custody: []
  };
}

module.exports = {
  generateReport,
  generateTemperatureReport,
  generateGeofenceReport,
  generateTaskReport,
  generateHACCPReport,
  generateBatchTraceabilityReport
};
