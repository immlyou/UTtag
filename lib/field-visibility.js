/**
 * Per-role field visibility for tenant resources.
 *
 * Usage
 * -----
 *   const { filterFieldsAll, canRead } = require("../../lib/field-visibility");
 *
 *   if (!canRead("tenant_users", user.role)) {
 *     return error(res, "Permission denied", 403, req);
 *   }
 *   json(res, filterFieldsAll(rows, "tenant_users", user.role), 200, req);
 *
 * Policy shape
 * ------------
 *   FIELD_POLICY[resource][role] can be:
 *     - "*"               -> caller sees the row unchanged (full access)
 *     - ["f1","f2",...]   -> caller only sees these keys (allowlist)
 *     - (absent)          -> caller cannot read this resource at all
 *
 * We intentionally use an allowlist rather than a denylist so that newly
 * added columns stay hidden until someone consciously exposes them.
 */

const FIELD_POLICY = {
  // Tenant user directory — admin sees everything, operator sees names/roles,
  // viewer ("user" role) sees only a minimal directory.
  tenant_users: {
    admin:    "*",
    operator: ["id", "email", "name", "role", "status", "created_at"],
    user:     ["id", "name", "role"],
  },

  // Devices — viewer sees label and live status but not raw MAC / created_by.
  client_tags: {
    admin:    "*",
    operator: "*",
    user:     ["id", "label", "status", "latest_data"],
  },

  // Alerts — everyone sees the same shape.
  alerts: {
    admin:    "*",
    operator: "*",
    user:     "*",
  },
};

function canRead(resource, role) {
  return Boolean(FIELD_POLICY[resource] && FIELD_POLICY[resource][role]);
}

function filterFields(row, resource, role) {
  if (row == null) return row;
  const policy = FIELD_POLICY[resource] && FIELD_POLICY[resource][role];
  if (!policy) return null;          // no access -> caller should have checked canRead first
  if (policy === "*") return row;
  const out = {};
  for (const k of policy) {
    if (k in row) out[k] = row[k];
  }
  return out;
}

function filterFieldsAll(rows, resource, role) {
  if (!Array.isArray(rows)) return rows;
  return rows.map(r => filterFields(r, resource, role)).filter(Boolean);
}

module.exports = { FIELD_POLICY, canRead, filterFields, filterFieldsAll };
