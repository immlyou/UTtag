# System Design Document (SDD)
# Phase 3: Multi-tenant Management Interface

**Document Version:** 1.0
**Last Updated:** 2026-03-18
**Author:** SA Agent (System Analyst)
**Status:** Draft
**Project:** UTtag - IoT Cold Chain Tracking Dashboard

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema Changes](#2-database-schema-changes)
3. [Backend API Design](#3-backend-api-design)
4. [Frontend Implementation](#4-frontend-implementation)
5. [Access Control Implementation](#5-access-control-implementation)
6. [Sequence Diagrams](#6-sequence-diagrams)

---

## 1. Architecture Overview

### 1.1 Multi-tenancy Enforcement Strategy

UTtag implements a **shared database, shared schema** multi-tenancy model with row-level isolation using `client_id` as the tenant discriminator.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Multi-tenancy Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Application Layer                               ││
│  │                                                                         ││
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐   ││
│  │   │ Super Admin │    │ Tenant Admin│    │   Tenant User / API     │   ││
│  │   │  (admins)   │    │(tenant_users│    │   (tenant_users /       │   ││
│  │   │             │    │  role=admin)│    │    api_keys)            │   ││
│  │   └──────┬──────┘    └──────┬──────┘    └───────────┬─────────────┘   ││
│  │          │                  │                       │                  ││
│  │          │    ALL TENANTS   │   SINGLE TENANT       │  SINGLE TENANT  ││
│  │          ▼                  ▼                       ▼                  ││
│  │   ┌─────────────────────────────────────────────────────────────────┐ ││
│  │   │                  Authentication Middleware                       │ ││
│  │   │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │ ││
│  │   │   │ JWT Verify  │  │ Extract     │  │ Attach client_id        │ │ ││
│  │   │   │ (admins or  │  │ client_id   │  │ to req.tenantId         │ │ ││
│  │   │   │ tenant_users│  │ from token  │  │                         │ │ ││
│  │   │   └─────────────┘  └─────────────┘  └─────────────────────────┘ │ ││
│  │   └─────────────────────────────────────────────────────────────────┘ ││
│  │                                  │                                     ││
│  │   ┌─────────────────────────────────────────────────────────────────┐ ││
│  │   │                   Permission Middleware                          │ ││
│  │   │   requireSuperAdmin() │ requireTenantAdmin() │ requirePermission │ ││
│  │   └─────────────────────────────────────────────────────────────────┘ ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                  │                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Data Access Layer                               ││
│  │                                                                         ││
│  │   ALL queries for tenant-scoped tables MUST include:                    ││
│  │   WHERE client_id = req.tenantId (enforced by tenantScope middleware)   ││
│  │                                                                         ││
│  │   Super Admin bypass: can specify ?client_id=xxx or access all          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                  │                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    PostgreSQL + Supabase RLS                            ││
│  │                                                                         ││
│  │   Row Level Security policies provide defense-in-depth:                 ││
│  │   - Even if application logic fails, RLS prevents cross-tenant access   ││
│  │   - Policies check auth.uid() or custom claims for client_id            ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Role Hierarchy

```
                         ┌─────────────────────┐
                         │     Super Admin     │
                         │  (admins table)     │
                         │  role = 'superadmin'│
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
            ┌───────▼───────┐ ┌─────▼─────┐ ┌───────▼───────┐
            │   Tenant A    │ │  Tenant B │ │   Tenant C    │
            │   (client)    │ │  (client) │ │   (client)    │
            └───────┬───────┘ └─────┬─────┘ └───────┬───────┘
                    │               │               │
         ┌──────────┴──────────┐    │    ┌──────────┴──────────┐
         │                     │    │    │                     │
    ┌────▼────┐          ┌─────▼────▼────▼─────┐          ┌────▼────┐
    │  Admin  │          │      Operator      │          │  User   │
    │(tenant_ │          │   (tenant_users    │          │(tenant_ │
    │ users)  │          │    role=operator)  │          │ users)  │
    └─────────┘          └────────────────────┘          └─────────┘
```

**Role Capabilities:**

| Scope | Super Admin | Tenant Admin | Operator | User |
|-------|:-----------:|:------------:|:--------:|:----:|
| Access all tenants | Yes | No | No | No |
| Create/Edit tenants | Yes | No | No | No |
| Manage tenant users | Yes | Own tenant | No | No |
| Manage devices | Yes | Own tenant | Own tenant | No |
| Manage API keys | Yes | Own tenant | No | No |
| View data | Yes | Own tenant | Own tenant | Own tenant |
| Export data | Yes | Own tenant | Own tenant | No |
| View analytics | Yes | Own tenant | Own tenant | Own tenant |

### 1.3 Data Isolation Strategy

**Three-Layer Defense:**

1. **Application Layer:** Middleware injects `client_id` filter into all queries
2. **API Layer:** Permission checks verify role and tenant ownership
3. **Database Layer:** RLS policies as final safety net

**Tenant-Scoped Tables:**
- `tenant_users` - Users within tenant (new)
- `client_tags` - Device bindings (existing)
- `api_keys` - API keys (existing)
- `sensor_data` - Via client_tags.mac (existing)
- `usage_logs` / `usage_daily` - Usage tracking (existing)
- `report_schedules` / `report_executions` - Reports (existing)
- `audit_logs` - Audit trail (new)

---

## 2. Database Schema Changes

### 2.1 New Tables

```sql
-- ============================================
-- Phase 3: Multi-tenant User Management
-- ============================================

-- Tenant Users (users within client organizations)
CREATE TABLE tenant_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,

  -- User Identity
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,

  -- Role within tenant: admin > operator > user
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'operator', 'user')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),

  -- Profile
  phone TEXT,
  avatar_url TEXT,

  -- Security
  last_login_at TIMESTAMPTZ,
  login_count INTEGER DEFAULT 0,
  failed_login_count INTEGER DEFAULT 0,
  locked_until TIMESTAMPTZ,

  -- Invitation
  invite_token TEXT,
  invite_expires_at TIMESTAMPTZ,
  invited_by UUID REFERENCES tenant_users(id),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(client_id, email)
);

-- Permissions (RBAC - predefined permissions)
CREATE TABLE permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,       -- e.g., 'users:read', 'devices:write'
  name TEXT NOT NULL,              -- Human-readable name
  description TEXT,
  category TEXT,                   -- Grouping: 'users', 'devices', 'reports', etc.
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Role Permissions (which permissions each role has)
CREATE TABLE role_permissions (
  role TEXT NOT NULL,              -- 'admin', 'operator', 'user'
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_id)
);

-- Audit Log (track all admin actions)
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,

  -- Actor
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'tenant_user', 'api_key', 'system')),
  actor_id UUID,                   -- admin.id, tenant_user.id, or api_key.id
  actor_email TEXT,

  -- Target
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  target_type TEXT,                -- 'client', 'user', 'device', 'api_key', etc.
  target_id UUID,

  -- Action
  action TEXT NOT NULL,            -- 'create', 'update', 'delete', 'login', 'revoke', etc.
  resource TEXT NOT NULL,          -- 'clients', 'tenant_users', 'client_tags', etc.

  -- Details
  old_values JSONB,
  new_values JSONB,
  metadata JSONB DEFAULT '{}',

  -- Context
  ip_address TEXT,
  user_agent TEXT,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tenant Settings (per-tenant configuration)
CREATE TABLE tenant_settings (
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE PRIMARY KEY,

  -- Branding (Phase 3c)
  logo_url TEXT,
  primary_color TEXT,
  company_name_display TEXT,

  -- Notification Preferences
  alert_email_enabled BOOLEAN DEFAULT true,
  quota_warning_threshold INTEGER DEFAULT 80,   -- percentage
  daily_digest_enabled BOOLEAN DEFAULT false,

  -- Features
  features_enabled JSONB DEFAULT '[]',

  -- Metadata
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_tenant_users_client ON tenant_users(client_id);
CREATE INDEX idx_tenant_users_email ON tenant_users(email);
CREATE INDEX idx_tenant_users_status ON tenant_users(status);
CREATE INDEX idx_tenant_users_role ON tenant_users(role);
CREATE INDEX idx_audit_logs_client ON audit_logs(client_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, action);
CREATE INDEX idx_audit_logs_target ON audit_logs(target_type, target_id);

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER tenant_users_updated_at
  BEFORE UPDATE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 2.2 Default Permissions Data

```sql
-- Insert default permissions
INSERT INTO permissions (code, name, description, category) VALUES
  -- Users
  ('users:read', 'View Users', 'View user list and details', 'users'),
  ('users:create', 'Create Users', 'Add new users to organization', 'users'),
  ('users:update', 'Edit Users', 'Modify user details and roles', 'users'),
  ('users:delete', 'Remove Users', 'Remove users from organization', 'users'),

  -- Devices
  ('devices:read', 'View Devices', 'View device list and status', 'devices'),
  ('devices:bind', 'Bind Devices', 'Add devices to organization', 'devices'),
  ('devices:unbind', 'Unbind Devices', 'Remove devices from organization', 'devices'),
  ('devices:update', 'Edit Devices', 'Modify device labels and settings', 'devices'),

  -- Data
  ('data:read', 'View Data', 'View sensor data and history', 'data'),
  ('data:export', 'Export Data', 'Export data to CSV/PDF', 'data'),

  -- Reports
  ('reports:read', 'View Reports', 'View generated reports', 'reports'),
  ('reports:create', 'Create Reports', 'Generate new reports', 'reports'),
  ('reports:schedule', 'Schedule Reports', 'Create report schedules', 'reports'),

  -- API Keys
  ('apikeys:read', 'View API Keys', 'View API key list', 'apikeys'),
  ('apikeys:create', 'Create API Keys', 'Generate new API keys', 'apikeys'),
  ('apikeys:revoke', 'Revoke API Keys', 'Revoke existing API keys', 'apikeys'),

  -- Settings
  ('settings:read', 'View Settings', 'View organization settings', 'settings'),
  ('settings:update', 'Edit Settings', 'Modify organization settings', 'settings'),

  -- Analytics
  ('analytics:read', 'View Analytics', 'View usage analytics', 'analytics');

-- Assign permissions to roles
-- Admin gets all permissions
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions;

-- Operator gets limited permissions
INSERT INTO role_permissions (role, permission_id)
SELECT 'operator', id FROM permissions
WHERE code IN (
  'users:read',
  'devices:read', 'devices:bind', 'devices:unbind', 'devices:update',
  'data:read', 'data:export',
  'reports:read', 'reports:create',
  'apikeys:read',
  'settings:read',
  'analytics:read'
);

-- User gets view-only permissions
INSERT INTO role_permissions (role, permission_id)
SELECT 'user', id FROM permissions
WHERE code IN (
  'devices:read',
  'data:read',
  'reports:read',
  'analytics:read'
);
```

### 2.3 Row Level Security Policies

```sql
-- ============================================
-- Enable RLS on tenant-scoped tables
-- ============================================
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for tenant_users
-- ============================================

-- Super admins can see all users
CREATE POLICY "Super admins can view all tenant users"
  ON tenant_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Tenant users can see users in their own organization
CREATE POLICY "Tenant users can view own org users"
  ON tenant_users FOR SELECT
  USING (
    client_id = (
      SELECT client_id FROM tenant_users WHERE id = auth.uid()
    )
  );

-- Only tenant admins can create users in their org
CREATE POLICY "Tenant admins can create users"
  ON tenant_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE id = auth.uid()
        AND client_id = tenant_users.client_id
        AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid()
    )
  );

-- Tenant admins can update users in their org
CREATE POLICY "Tenant admins can update users"
  ON tenant_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE id = auth.uid()
        AND client_id = tenant_users.client_id
        AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid()
    )
  );

-- Tenant admins can delete users in their org
CREATE POLICY "Tenant admins can delete users"
  ON tenant_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users
      WHERE id = auth.uid()
        AND client_id = tenant_users.client_id
        AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid()
    )
  );

-- ============================================
-- RLS Policies for audit_logs
-- ============================================

-- Super admins can see all audit logs
CREATE POLICY "Super admins can view all audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

-- Tenant admins can see their org's audit logs
CREATE POLICY "Tenant admins can view own org audit logs"
  ON audit_logs FOR SELECT
  USING (
    client_id = (
      SELECT client_id FROM tenant_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only system can insert audit logs (via service role)
CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- ============================================
-- RLS Policies for tenant_settings
-- ============================================

-- Tenant users can view their org settings
CREATE POLICY "Tenant users can view own org settings"
  ON tenant_settings FOR SELECT
  USING (
    client_id = (SELECT client_id FROM tenant_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
  );

-- Tenant admins can update their org settings
CREATE POLICY "Tenant admins can update own org settings"
  ON tenant_settings FOR UPDATE
  USING (
    client_id = (
      SELECT client_id FROM tenant_users
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
  );
```

### 2.4 Existing Table Modifications

```sql
-- Add user_id tracking to existing tables for audit purposes
ALTER TABLE client_tags ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add indexes for tenant queries
CREATE INDEX IF NOT EXISTS idx_client_tags_client_created
  ON client_tags(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_client_status
  ON api_keys(client_id, status);
```

---

## 3. Backend API Design

### 3.1 API Route Structure

```
/api
├── /auth
│   └── login.js              # Existing: Admin login
│
├── /admin                    # Super Admin only (new)
│   ├── /clients
│   │   ├── list.js           # GET    - List all clients
│   │   ├── create.js         # POST   - Create client
│   │   ├── [id].js           # GET    - Get client details
│   │   ├── update.js         # PUT    - Update client
│   │   └── delete.js         # DELETE - Soft-delete client
│   │
│   ├── /users
│   │   ├── list.js           # GET    - List users (cross-tenant)
│   │   └── [id].js           # GET    - Get user details
│   │
│   ├── /analytics
│   │   ├── overview.js       # GET    - Platform overview
│   │   └── tenants.js        # GET    - Per-tenant analytics
│   │
│   └── audit-logs.js         # GET    - Query audit logs
│
├── /tenant                   # Tenant Users (new)
│   ├── /auth
│   │   ├── login.js          # POST   - Tenant user login
│   │   ├── me.js             # GET    - Current user info
│   │   └── invite.js         # POST   - Accept invitation
│   │
│   ├── /users
│   │   ├── list.js           # GET    - List org users
│   │   ├── create.js         # POST   - Create/invite user
│   │   ├── [id].js           # GET    - Get user details
│   │   ├── update.js         # PUT    - Update user
│   │   └── delete.js         # DELETE - Remove user
│   │
│   ├── /devices
│   │   ├── list.js           # GET    - List bound devices
│   │   ├── bind.js           # POST   - Bind device
│   │   ├── update.js         # PUT    - Update device label
│   │   └── unbind.js         # DELETE - Unbind device
│   │
│   ├── /keys
│   │   ├── list.js           # GET    - List API keys
│   │   ├── create.js         # POST   - Create key
│   │   └── revoke.js         # DELETE - Revoke key
│   │
│   ├── /usage.js             # GET    - Usage statistics
│   │
│   └── /settings.js          # GET/PUT - Org settings
│
├── /clients                  # Existing (keep for backward compat)
├── /keys                     # Existing (keep for backward compat)
└── /sensors                  # Existing
```

### 3.2 Admin API Endpoints (Super Admin Only)

#### GET /api/admin/clients

List all clients with filtering and pagination.

```javascript
// api/admin/clients/list.js
const { supabase } = require("../../../lib/supabase");
const { getAdminFromReq, json, error } = require("../../../lib/auth");
const { requireSuperAdmin } = require("../../../middleware/requireSuperAdmin");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return error(res, "Method not allowed", 405, req);

  const admin = await requireSuperAdmin(req, res);
  if (!admin) return; // Response already sent

  const { status, tier, search, page = 1, per_page = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(per_page);

  let query = supabase
    .from("clients")
    .select(`
      *,
      api_keys(count),
      client_tags(count),
      tenant_users(count)
    `, { count: "exact" })
    .neq("status", "deleted")
    .order("created_at", { ascending: false })
    .range(offset, offset + parseInt(per_page) - 1);

  if (status) query = query.eq("status", status);
  if (tier) query = query.eq("tier", tier);
  if (search) {
    const sanitized = search.replace(/[%_().,\\]/g, "");
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,company.ilike.%${sanitized}%`);
    }
  }

  const { data, count, error: dbErr } = await query;
  if (dbErr) return error(res, dbErr.message, 400, req);

  json(res, {
    clients: data,
    total: count,
    page: parseInt(page),
    per_page: parseInt(per_page)
  }, 200, req);
};
```

#### POST /api/admin/clients

Create a new client.

```javascript
// api/admin/clients/create.js
module.exports = async function handler(req, res) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { name, email, company, phone, tier = "free", notes } = req.body;

  if (!name || !email) {
    return error(res, "Name and email are required", 400, req);
  }

  // Get tier limits
  const { data: tierData } = await supabase
    .from("billing_tiers")
    .select("max_tags, max_keys")
    .eq("tier", tier)
    .single();

  const { data: client, error: dbErr } = await supabase
    .from("clients")
    .insert({
      name,
      email,
      company,
      phone,
      tier,
      notes,
      max_tags: tierData?.max_tags || 10,
      max_keys: tierData?.max_keys || 2
    })
    .select()
    .single();

  if (dbErr) {
    if (dbErr.code === "23505") {
      return error(res, "Email already exists", 409, req);
    }
    return error(res, dbErr.message, 400, req);
  }

  // Create default tenant settings
  await supabase.from("tenant_settings").insert({ client_id: client.id });

  // Audit log
  await logAudit({
    actor_type: "admin",
    actor_id: admin.id,
    actor_email: admin.username,
    client_id: client.id,
    target_type: "client",
    target_id: client.id,
    action: "create",
    resource: "clients",
    new_values: client,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"]
  });

  json(res, client, 201, req);
};
```

#### PUT /api/admin/clients/:id

Update client details.

```javascript
// api/admin/clients/update.js
module.exports = async function handler(req, res) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;
  const updates = req.body;

  // Get current values for audit
  const { data: current } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();

  if (!current) return error(res, "Client not found", 404, req);

  const allowedFields = ["name", "email", "company", "phone", "tier", "status", "max_tags", "max_keys", "notes"];
  const filtered = Object.fromEntries(
    Object.entries(updates).filter(([k]) => allowedFields.includes(k))
  );

  const { data: updated, error: dbErr } = await supabase
    .from("clients")
    .update(filtered)
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 400, req);

  await logAudit({
    actor_type: "admin",
    actor_id: admin.id,
    actor_email: admin.username,
    client_id: id,
    target_type: "client",
    target_id: id,
    action: "update",
    resource: "clients",
    old_values: current,
    new_values: updated,
    ip_address: req.ip
  });

  json(res, updated, 200, req);
};
```

#### DELETE /api/admin/clients/:id

Soft-delete client.

```javascript
// api/admin/clients/delete.js
module.exports = async function handler(req, res) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { id } = req.query;

  const { data: updated, error: dbErr } = await supabase
    .from("clients")
    .update({ status: "deleted" })
    .eq("id", id)
    .select()
    .single();

  if (dbErr) return error(res, dbErr.message, 400, req);

  await logAudit({
    actor_type: "admin",
    actor_id: admin.id,
    client_id: id,
    target_type: "client",
    target_id: id,
    action: "delete",
    resource: "clients"
  });

  json(res, { success: true }, 200, req);
};
```

#### GET /api/admin/analytics

Platform-wide analytics.

```javascript
// api/admin/analytics/overview.js
module.exports = async function handler(req, res) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  const { period = "30d" } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Parallel queries
  const [
    { count: totalClients },
    { count: activeClients },
    { count: totalUsers },
    { count: totalDevices },
    { data: apiUsage },
    { data: tierDist }
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }).neq("status", "deleted"),
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("tenant_users").select("*", { count: "exact", head: true }),
    supabase.from("client_tags").select("*", { count: "exact", head: true }),
    supabase.from("usage_daily").select("request_count").gte("date", since.split("T")[0]),
    supabase.from("clients").select("tier").neq("status", "deleted")
  ]);

  const totalApiCalls = apiUsage?.reduce((sum, r) => sum + r.request_count, 0) || 0;

  const tierDistribution = {};
  tierDist?.forEach(c => {
    tierDistribution[c.tier] = (tierDistribution[c.tier] || 0) + 1;
  });

  json(res, {
    summary: {
      total_clients: totalClients,
      active_clients: activeClients,
      total_users: totalUsers,
      total_devices: totalDevices,
      api_calls_period: totalApiCalls
    },
    tier_distribution: tierDistribution,
    period
  }, 200, req);
};
```

### 3.3 Tenant API Endpoints

#### POST /api/tenant/auth/login

Tenant user login.

```javascript
// api/tenant/auth/login.js
const bcrypt = require("bcryptjs");
const { signToken } = require("../../../lib/auth");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return error(res, "Method not allowed", 405, req);

  const { email, password } = req.body;
  if (!email || !password) return error(res, "Email and password required", 400, req);

  const { data: user } = await supabase
    .from("tenant_users")
    .select("*, clients(*)")
    .eq("email", email)
    .eq("status", "active")
    .single();

  if (!user) return error(res, "Invalid credentials", 401, req);

  // Check client status
  if (user.clients.status !== "active") {
    return error(res, "Organization is suspended", 403, req);
  }

  // Check account lock
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return error(res, "Account is locked. Try again later.", 423, req);
  }

  const passwordValid = await bcrypt.compare(password, user.password_hash);

  if (!passwordValid) {
    // Increment failed login count
    await supabase
      .from("tenant_users")
      .update({
        failed_login_count: user.failed_login_count + 1,
        locked_until: user.failed_login_count >= 4
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : null
      })
      .eq("id", user.id);

    return error(res, "Invalid credentials", 401, req);
  }

  // Reset failed login count, update last login
  await supabase
    .from("tenant_users")
    .update({
      failed_login_count: 0,
      login_count: user.login_count + 1,
      last_login_at: new Date().toISOString()
    })
    .eq("id", user.id);

  // Get permissions for role
  const { data: permissions } = await supabase
    .from("role_permissions")
    .select("permissions(code)")
    .eq("role", user.role);

  const permissionCodes = permissions?.map(p => p.permissions.code) || [];

  // Sign JWT with tenant context
  const token = signToken({
    id: user.id,
    email: user.email,
    name: user.name,
    client_id: user.client_id,
    client_name: user.clients.name,
    role: user.role,
    permissions: permissionCodes,
    type: "tenant_user"
  });

  await logAudit({
    actor_type: "tenant_user",
    actor_id: user.id,
    actor_email: user.email,
    client_id: user.client_id,
    action: "login",
    resource: "auth"
  });

  json(res, {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      client_id: user.client_id,
      client_name: user.clients.name
    },
    permissions: permissionCodes
  }, 200, req);
};
```

#### GET/POST/PUT/DELETE /api/tenant/users

Manage users within tenant.

```javascript
// api/tenant/users/list.js
module.exports = async function handler(req, res) {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  // Check permission
  if (!hasPermission(user, "users:read")) {
    return error(res, "Permission denied", 403, req);
  }

  const { data: users, error: dbErr } = await supabase
    .from("tenant_users")
    .select("id, email, name, role, status, last_login_at, created_at")
    .eq("client_id", user.client_id)
    .order("created_at", { ascending: false });

  if (dbErr) return error(res, dbErr.message, 400, req);
  json(res, users, 200, req);
};

// api/tenant/users/create.js
module.exports = async function handler(req, res) {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "users:create")) {
    return error(res, "Permission denied", 403, req);
  }

  const { email, name, role = "user", send_invite = true } = req.body;

  if (!email || !name) {
    return error(res, "Email and name required", 400, req);
  }

  // Validate role (cannot create admin if not admin)
  if (role === "admin" && user.role !== "admin") {
    return error(res, "Cannot create admin users", 403, req);
  }

  // Generate invite token
  const inviteToken = crypto.randomBytes(32).toString("hex");
  const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const { data: newUser, error: dbErr } = await supabase
    .from("tenant_users")
    .insert({
      client_id: user.client_id,
      email,
      name,
      role,
      status: "pending",
      invite_token: inviteToken,
      invite_expires_at: inviteExpires.toISOString(),
      invited_by: user.id
    })
    .select()
    .single();

  if (dbErr) {
    if (dbErr.code === "23505") {
      return error(res, "User with this email already exists", 409, req);
    }
    return error(res, dbErr.message, 400, req);
  }

  // Send invitation email (if configured)
  if (send_invite) {
    await sendInvitationEmail(email, name, inviteToken, user.client_name);
  }

  await logAudit({
    actor_type: "tenant_user",
    actor_id: user.id,
    actor_email: user.email,
    client_id: user.client_id,
    target_type: "user",
    target_id: newUser.id,
    action: "create",
    resource: "tenant_users",
    new_values: { email, name, role }
  });

  json(res, newUser, 201, req);
};
```

#### GET/POST/DELETE /api/tenant/devices

Manage device bindings.

```javascript
// api/tenant/devices/list.js
module.exports = async function handler(req, res) {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "devices:read")) {
    return error(res, "Permission denied", 403, req);
  }

  // Get devices with latest sensor data
  const { data: devices } = await supabase
    .from("client_tags")
    .select("*")
    .eq("client_id", user.client_id)
    .order("created_at", { ascending: false });

  // Enrich with latest data
  const macs = devices.map(d => d.mac);
  const { data: latestData } = await supabase
    .from("sensor_data")
    .select("mac, temperature, humidity, created_at")
    .in("mac", macs)
    .order("created_at", { ascending: false });

  const latestByMac = {};
  latestData?.forEach(d => {
    if (!latestByMac[d.mac]) latestByMac[d.mac] = d;
  });

  const enriched = devices.map(d => ({
    ...d,
    latest_data: latestByMac[d.mac] || null,
    status: getDeviceStatus(latestByMac[d.mac]?.created_at)
  }));

  json(res, enriched, 200, req);
};

function getDeviceStatus(lastSeen) {
  if (!lastSeen) return "offline";
  const diff = Date.now() - new Date(lastSeen).getTime();
  if (diff < 5 * 60 * 1000) return "online";
  if (diff < 60 * 60 * 1000) return "idle";
  return "offline";
}

// api/tenant/devices/bind.js
module.exports = async function handler(req, res) {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  if (!hasPermission(user, "devices:bind")) {
    return error(res, "Permission denied", 403, req);
  }

  const { mac, label } = req.body;

  if (!mac || !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(mac)) {
    return error(res, "Invalid MAC address format", 400, req);
  }

  // Check quota
  const { count } = await supabase
    .from("client_tags")
    .select("*", { count: "exact", head: true })
    .eq("client_id", user.client_id);

  const { data: client } = await supabase
    .from("clients")
    .select("max_tags")
    .eq("id", user.client_id)
    .single();

  if (client.max_tags && count >= client.max_tags) {
    return error(res, `Device quota exceeded (${count}/${client.max_tags})`, 403, req);
  }

  const { data: device, error: dbErr } = await supabase
    .from("client_tags")
    .insert({
      client_id: user.client_id,
      mac: mac.toUpperCase(),
      label,
      created_by: user.id
    })
    .select()
    .single();

  if (dbErr) {
    if (dbErr.code === "23505") {
      return error(res, "Device already bound", 409, req);
    }
    return error(res, dbErr.message, 400, req);
  }

  await logAudit({
    actor_type: "tenant_user",
    actor_id: user.id,
    actor_email: user.email,
    client_id: user.client_id,
    target_type: "device",
    target_id: device.id,
    action: "bind",
    resource: "client_tags",
    new_values: { mac, label }
  });

  json(res, device, 201, req);
};
```

#### GET /api/tenant/usage

Usage statistics for tenant.

```javascript
// api/tenant/usage.js
module.exports = async function handler(req, res) {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { period = "30d" } = req.query;
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const [
    { count: devicesCount },
    { count: usersCount },
    { count: keysCount },
    { data: dailyUsage },
    { data: client }
  ] = await Promise.all([
    supabase.from("client_tags")
      .select("*", { count: "exact", head: true })
      .eq("client_id", user.client_id),
    supabase.from("tenant_users")
      .select("*", { count: "exact", head: true })
      .eq("client_id", user.client_id),
    supabase.from("api_keys")
      .select("*", { count: "exact", head: true })
      .eq("client_id", user.client_id)
      .eq("status", "active"),
    supabase.from("usage_daily")
      .select("date, request_count, error_count")
      .eq("client_id", user.client_id)
      .gte("date", since)
      .order("date", { ascending: true }),
    supabase.from("clients")
      .select("max_tags, max_keys, tier")
      .eq("id", user.client_id)
      .single()
  ]);

  const totalCalls = dailyUsage?.reduce((s, d) => s + d.request_count, 0) || 0;
  const totalErrors = dailyUsage?.reduce((s, d) => s + d.error_count, 0) || 0;

  json(res, {
    summary: {
      devices_bound: devicesCount,
      devices_limit: client.max_tags,
      users_count: usersCount,
      api_keys_active: keysCount,
      api_keys_limit: client.max_keys,
      api_calls_period: totalCalls,
      api_errors_period: totalErrors,
      tier: client.tier
    },
    daily_usage: dailyUsage || []
  }, 200, req);
};
```

---

## 4. Frontend Implementation

### 4.1 New Functions in app.js

```javascript
// ================================================================
//  [M] Multi-tenant Admin Panel
// ================================================================

let adminPanelState = {
  currentView: "clients",       // clients | users | analytics | audit
  selectedClient: null,
  clientTab: "overview",        // overview | users | devices | keys | usage
  clients: [],
  clientUsers: [],
  clientDevices: [],
  clientKeys: [],
  usageData: null
};

// ----------------------------------------------------------------
//  [M1] Main Admin Panel Renderer
// ----------------------------------------------------------------
function renderAdminPanel() {
  const panel = document.getElementById("admin-panel");
  if (!panel) return;

  panel.innerHTML = `
    <div class="admin-container">
      <aside class="admin-sidebar">
        <div class="sidebar-header">
          <h3>Admin Panel</h3>
        </div>
        <nav class="sidebar-nav">
          <button class="sidebar-item ${adminPanelState.currentView === 'clients' ? 'active' : ''}"
                  onclick="switchAdminView('clients')">
            <span class="icon">🏢</span> Clients
          </button>
          <button class="sidebar-item ${adminPanelState.currentView === 'users' ? 'active' : ''}"
                  onclick="switchAdminView('users')">
            <span class="icon">👥</span> All Users
          </button>
          <button class="sidebar-item ${adminPanelState.currentView === 'analytics' ? 'active' : ''}"
                  onclick="switchAdminView('analytics')">
            <span class="icon">📊</span> Analytics
          </button>
          <button class="sidebar-item ${adminPanelState.currentView === 'audit' ? 'active' : ''}"
                  onclick="switchAdminView('audit')">
            <span class="icon">📋</span> Audit Logs
          </button>
        </nav>
      </aside>
      <main class="admin-main">
        ${renderAdminContent()}
      </main>
    </div>
  `;
}

function renderAdminContent() {
  switch (adminPanelState.currentView) {
    case "clients":
      return adminPanelState.selectedClient
        ? renderClientDetail()
        : renderClientList();
    case "users":
      return renderAllUsersList();
    case "analytics":
      return renderPlatformAnalytics();
    case "audit":
      return renderAuditLogs();
    default:
      return renderClientList();
  }
}

function switchAdminView(view) {
  adminPanelState.currentView = view;
  adminPanelState.selectedClient = null;
  renderAdminPanel();

  // Load data for view
  switch (view) {
    case "clients": loadClients(); break;
    case "users": loadAllUsers(); break;
    case "analytics": loadPlatformAnalytics(); break;
    case "audit": loadAuditLogs(); break;
  }
}

// ----------------------------------------------------------------
//  [M2] Client List
// ----------------------------------------------------------------
async function loadClients() {
  const status = document.getElementById("admin-status");
  if (status) status.innerHTML = '<span class="spinner"></span> Loading...';

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/clients", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error || "Failed to load clients");

    adminPanelState.clients = data.clients || data;
    renderAdminPanel();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderClientList() {
  const clients = adminPanelState.clients;

  return `
    <div class="admin-header">
      <h2>Clients</h2>
      <div class="header-actions">
        <input type="text" id="client-search" placeholder="Search clients..."
               oninput="filterClients(this.value)" class="search-input">
        <select id="client-tier-filter" onchange="filterClientsByTier(this.value)">
          <option value="">All Tiers</option>
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <button class="btn-primary" onclick="showCreateClientModal()">
          + Create Client
        </button>
      </div>
    </div>

    <div class="admin-table-container">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Company</th>
            <th>Tier</th>
            <th>Status</th>
            <th>Tags</th>
            <th>Users</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${clients.map(c => `
            <tr onclick="selectClient('${c.id}')" class="clickable-row">
              <td>
                <strong>${escapeHtml(c.name)}</strong>
                <div class="text-muted">${escapeHtml(c.email)}</div>
              </td>
              <td>${escapeHtml(c.company || "-")}</td>
              <td><span class="badge tier-${c.tier}">${c.tier}</span></td>
              <td><span class="badge status-${c.status}">${c.status}</span></td>
              <td>${c.client_tags?.[0]?.count || 0} / ${c.max_tags || "∞"}</td>
              <td>${c.tenant_users?.[0]?.count || 0}</td>
              <td>${formatDate(c.created_at)}</td>
              <td>
                <button class="btn-icon" onclick="event.stopPropagation(); editClient('${c.id}')" title="Edit">
                  ✏️
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); toggleClientStatus('${c.id}', '${c.status}')"
                        title="${c.status === 'active' ? 'Suspend' : 'Activate'}">
                  ${c.status === "active" ? "⏸️" : "▶️"}
                </button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// ----------------------------------------------------------------
//  [M3] Client Detail View
// ----------------------------------------------------------------
async function selectClient(clientId) {
  adminPanelState.selectedClient = adminPanelState.clients.find(c => c.id === clientId);
  adminPanelState.clientTab = "overview";
  renderAdminPanel();

  // Load client data
  await Promise.all([
    loadClientUsers(clientId),
    loadClientDevices(clientId),
    loadClientKeys(clientId),
    loadClientUsage(clientId)
  ]);
}

function renderClientDetail() {
  const client = adminPanelState.selectedClient;
  if (!client) return renderClientList();

  return `
    <div class="admin-header">
      <button class="btn-back" onclick="backToClientList()">← Back to Clients</button>
      <div class="client-header-info">
        <h2>${escapeHtml(client.name)}</h2>
        <span class="badge status-${client.status}">${client.status}</span>
        <span class="badge tier-${client.tier}">${client.tier}</span>
      </div>
      <button class="btn-secondary" onclick="editClient('${client.id}')">Edit Client</button>
    </div>

    <div class="client-tabs">
      <button class="tab-btn ${adminPanelState.clientTab === 'overview' ? 'active' : ''}"
              onclick="switchClientTab('overview')">Overview</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'users' ? 'active' : ''}"
              onclick="switchClientTab('users')">Users</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'devices' ? 'active' : ''}"
              onclick="switchClientTab('devices')">Devices</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'keys' ? 'active' : ''}"
              onclick="switchClientTab('keys')">API Keys</button>
      <button class="tab-btn ${adminPanelState.clientTab === 'usage' ? 'active' : ''}"
              onclick="switchClientTab('usage')">Usage</button>
    </div>

    <div class="client-tab-content">
      ${renderClientTabContent()}
    </div>
  `;
}

function renderClientTabContent() {
  switch (adminPanelState.clientTab) {
    case "overview": return renderClientOverview();
    case "users": return renderUserList();
    case "devices": return renderDeviceList();
    case "keys": return renderKeyList();
    case "usage": return renderUsageChart();
    default: return renderClientOverview();
  }
}

function renderClientOverview() {
  const client = adminPanelState.selectedClient;
  const users = adminPanelState.clientUsers;
  const devices = adminPanelState.clientDevices;
  const keys = adminPanelState.clientKeys;

  return `
    <div class="overview-grid">
      <div class="stat-card">
        <div class="stat-icon">👥</div>
        <div class="stat-content">
          <div class="stat-value">${users.length}</div>
          <div class="stat-label">Users</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📡</div>
        <div class="stat-content">
          <div class="stat-value">${devices.length} / ${client.max_tags || '∞'}</div>
          <div class="stat-label">Devices</div>
          <div class="stat-bar">
            <div class="stat-bar-fill" style="width: ${client.max_tags ? (devices.length / client.max_tags * 100) : 0}%"></div>
          </div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">🔑</div>
        <div class="stat-content">
          <div class="stat-value">${keys.filter(k => k.status === 'active').length} / ${client.max_keys || '∞'}</div>
          <div class="stat-label">API Keys</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon">📊</div>
        <div class="stat-content">
          <div class="stat-value">${adminPanelState.usageData?.summary?.api_calls_period || 0}</div>
          <div class="stat-label">API Calls (30d)</div>
        </div>
      </div>
    </div>

    <div class="client-info-section">
      <h3>Client Information</h3>
      <div class="info-grid">
        <div class="info-item">
          <label>Email</label>
          <span>${escapeHtml(client.email)}</span>
        </div>
        <div class="info-item">
          <label>Company</label>
          <span>${escapeHtml(client.company || "-")}</span>
        </div>
        <div class="info-item">
          <label>Phone</label>
          <span>${escapeHtml(client.phone || "-")}</span>
        </div>
        <div class="info-item">
          <label>Created</label>
          <span>${formatDateTime(client.created_at)}</span>
        </div>
      </div>
      ${client.notes ? `<div class="info-notes"><label>Notes</label><p>${escapeHtml(client.notes)}</p></div>` : ""}
    </div>
  `;
}

// ----------------------------------------------------------------
//  [M4] User List (within tenant)
// ----------------------------------------------------------------
async function loadClientUsers(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/users`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();
    adminPanelState.clientUsers = Array.isArray(data) ? data : [];
    if (adminPanelState.clientTab === "users") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load users:", err);
  }
}

function renderUserList() {
  const users = adminPanelState.clientUsers;

  return `
    <div class="tab-header">
      <h3>Users (${users.length})</h3>
      <button class="btn-primary" onclick="showInviteUserModal()">+ Invite User</button>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Last Login</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>${escapeHtml(u.name)}</td>
            <td>${escapeHtml(u.email)}</td>
            <td><span class="badge role-${u.role}">${u.role}</span></td>
            <td><span class="badge status-${u.status}">${u.status}</span></td>
            <td>${u.last_login_at ? formatDateTime(u.last_login_at) : "Never"}</td>
            <td>
              <button class="btn-icon" onclick="editUser('${u.id}')" title="Edit">✏️</button>
              <button class="btn-icon" onclick="removeUser('${u.id}')" title="Remove">🗑️</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ----------------------------------------------------------------
//  [M5] Device List
// ----------------------------------------------------------------
async function loadClientDevices(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/devices`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();
    adminPanelState.clientDevices = Array.isArray(data) ? data : [];
    if (adminPanelState.clientTab === "devices") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load devices:", err);
  }
}

function renderDeviceList() {
  const devices = adminPanelState.clientDevices;
  const client = adminPanelState.selectedClient;

  return `
    <div class="tab-header">
      <h3>Devices (${devices.length} / ${client.max_tags || '∞'})</h3>
      <button class="btn-primary" onclick="showBindDeviceModal()">+ Bind Device</button>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>MAC Address</th>
          <th>Label</th>
          <th>Status</th>
          <th>Last Seen</th>
          <th>Temperature</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${devices.map(d => `
          <tr>
            <td><code>${d.mac}</code></td>
            <td>${escapeHtml(d.label || "-")}</td>
            <td><span class="badge status-${d.status || 'offline'}">${d.status || 'offline'}</span></td>
            <td>${d.latest_data?.created_at ? formatDateTime(d.latest_data.created_at) : "Never"}</td>
            <td>${d.latest_data?.temperature ? d.latest_data.temperature + "°C" : "-"}</td>
            <td>
              <button class="btn-icon" onclick="editDevice('${d.id}')" title="Edit">✏️</button>
              <button class="btn-icon" onclick="unbindDevice('${d.id}')" title="Unbind">🔓</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ----------------------------------------------------------------
//  [M6] API Key List
// ----------------------------------------------------------------
async function loadClientKeys(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/keys`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    const data = await resp.json();
    adminPanelState.clientKeys = Array.isArray(data) ? data : [];
    if (adminPanelState.clientTab === "keys") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load keys:", err);
  }
}

function renderKeyList() {
  const keys = adminPanelState.clientKeys;
  const client = adminPanelState.selectedClient;
  const activeKeys = keys.filter(k => k.status === "active");

  return `
    <div class="tab-header">
      <h3>API Keys (${activeKeys.length} / ${client.max_keys || '∞'})</h3>
      <button class="btn-primary" onclick="showCreateKeyModal()">+ Create Key</button>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Key</th>
          <th>Permissions</th>
          <th>Status</th>
          <th>Last Used</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${keys.map(k => `
          <tr>
            <td>${escapeHtml(k.name)}</td>
            <td><code>${k.key.substring(0, 8)}...${k.key.slice(-4)}</code></td>
            <td>${(k.permissions || []).join(", ")}</td>
            <td><span class="badge status-${k.status}">${k.status}</span></td>
            <td>${k.last_used_at ? formatDateTime(k.last_used_at) : "Never"}</td>
            <td>
              ${k.status === "active" ? `
                <button class="btn-icon" onclick="revokeKey('${k.id}')" title="Revoke">🔒</button>
              ` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ----------------------------------------------------------------
//  [M7] Usage Chart
// ----------------------------------------------------------------
async function loadClientUsage(clientId) {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch(`/api/admin/clients/${clientId}/usage`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    adminPanelState.usageData = await resp.json();
    if (adminPanelState.clientTab === "usage") renderAdminPanel();
  } catch (err) {
    console.error("Failed to load usage:", err);
  }
}

function renderUsageChart() {
  const usage = adminPanelState.usageData;
  if (!usage) return '<div class="loading">Loading usage data...</div>';

  const daily = usage.daily_usage || [];
  const maxCalls = Math.max(...daily.map(d => d.request_count), 1);

  return `
    <div class="usage-summary">
      <div class="stat-card">
        <div class="stat-value">${usage.summary?.api_calls_period || 0}</div>
        <div class="stat-label">Total API Calls (30d)</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${usage.summary?.api_errors_period || 0}</div>
        <div class="stat-label">Errors</div>
      </div>
    </div>

    <div class="usage-chart">
      <h3>Daily API Usage</h3>
      <div class="chart-container">
        ${daily.slice(-30).map(d => `
          <div class="chart-bar" style="height: ${(d.request_count / maxCalls * 100)}%"
               title="${d.date}: ${d.request_count} calls">
          </div>
        `).join("")}
      </div>
      <div class="chart-labels">
        ${daily.slice(-30).filter((_, i) => i % 7 === 0).map(d => `
          <span>${d.date.slice(5)}</span>
        `).join("")}
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------
//  [M8] Platform Analytics (Super Admin)
// ----------------------------------------------------------------
async function loadPlatformAnalytics() {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/analytics/overview", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    adminPanelState.analyticsData = await resp.json();
    renderAdminPanel();
  } catch (err) {
    showToast("Failed to load analytics", "error");
  }
}

function renderPlatformAnalytics() {
  const data = adminPanelState.analyticsData;
  if (!data) return '<div class="loading">Loading analytics...</div>';

  return `
    <div class="admin-header">
      <h2>Platform Analytics</h2>
      <select onchange="changePeriod(this.value)">
        <option value="7d">Last 7 days</option>
        <option value="30d" selected>Last 30 days</option>
        <option value="90d">Last 90 days</option>
      </select>
    </div>

    <div class="overview-grid">
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.total_clients || 0}</div>
        <div class="stat-label">Total Clients</div>
      </div>
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.active_clients || 0}</div>
        <div class="stat-label">Active Clients</div>
      </div>
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.total_users || 0}</div>
        <div class="stat-label">Total Users</div>
      </div>
      <div class="stat-card large">
        <div class="stat-value">${data.summary?.total_devices || 0}</div>
        <div class="stat-label">Total Devices</div>
      </div>
    </div>

    <div class="analytics-section">
      <h3>Tier Distribution</h3>
      <div class="tier-chart">
        ${Object.entries(data.tier_distribution || {}).map(([tier, count]) => `
          <div class="tier-bar">
            <span class="tier-label">${tier}</span>
            <div class="tier-bar-container">
              <div class="tier-bar-fill tier-${tier}"
                   style="width: ${count / data.summary.total_clients * 100}%"></div>
            </div>
            <span class="tier-count">${count}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// ----------------------------------------------------------------
//  [M9] Audit Logs
// ----------------------------------------------------------------
async function loadAuditLogs() {
  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/audit-logs?limit=100", {
      headers: { "Authorization": `Bearer ${token}` }
    });
    adminPanelState.auditLogs = await resp.json();
    renderAdminPanel();
  } catch (err) {
    showToast("Failed to load audit logs", "error");
  }
}

function renderAuditLogs() {
  const logs = adminPanelState.auditLogs || [];

  return `
    <div class="admin-header">
      <h2>Audit Logs</h2>
      <div class="header-actions">
        <select id="audit-resource-filter" onchange="filterAuditLogs()">
          <option value="">All Resources</option>
          <option value="clients">Clients</option>
          <option value="tenant_users">Users</option>
          <option value="client_tags">Devices</option>
          <option value="api_keys">API Keys</option>
        </select>
        <select id="audit-action-filter" onchange="filterAuditLogs()">
          <option value="">All Actions</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="login">Login</option>
        </select>
      </div>
    </div>

    <table class="admin-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Resource</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map(log => `
          <tr>
            <td>${formatDateTime(log.created_at)}</td>
            <td>
              <span class="badge">${log.actor_type}</span>
              ${escapeHtml(log.actor_email || log.actor_id?.slice(0, 8) || "System")}
            </td>
            <td><span class="badge action-${log.action}">${log.action}</span></td>
            <td>${log.resource}</td>
            <td>
              <button class="btn-icon" onclick="showAuditDetail('${log.id}')" title="View Details">
                🔍
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ----------------------------------------------------------------
//  [M10] Modal Helpers
// ----------------------------------------------------------------
function showCreateClientModal() {
  showModal("Create Client", `
    <form id="create-client-form" onsubmit="createClient(event)">
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" required>
      </div>
      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="email" required>
      </div>
      <div class="form-group">
        <label>Company</label>
        <input type="text" name="company">
      </div>
      <div class="form-group">
        <label>Phone</label>
        <input type="text" name="phone">
      </div>
      <div class="form-group">
        <label>Tier</label>
        <select name="tier">
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
      <div class="form-group">
        <label>Notes</label>
        <textarea name="notes"></textarea>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary">Create</button>
      </div>
    </form>
  `);
}

async function createClient(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));

  try {
    const token = localStorage.getItem("utfind_admin_token");
    const resp = await fetch("/api/admin/clients", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!resp.ok) {
      const err = await resp.json();
      throw new Error(err.error || "Failed to create client");
    }

    closeModal();
    showToast("Client created successfully", "success");
    loadClients();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function showInviteUserModal() {
  showModal("Invite User", `
    <form id="invite-user-form" onsubmit="inviteUser(event)">
      <div class="form-group">
        <label>Email *</label>
        <input type="email" name="email" required>
      </div>
      <div class="form-group">
        <label>Name *</label>
        <input type="text" name="name" required>
      </div>
      <div class="form-group">
        <label>Role</label>
        <select name="role">
          <option value="user">User (View only)</option>
          <option value="operator">Operator (Manage devices)</option>
          <option value="admin">Admin (Full access)</option>
        </select>
      </div>
      <p class="form-hint">An invitation email will be sent to the user.</p>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary">Send Invitation</button>
      </div>
    </form>
  `);
}

function showBindDeviceModal() {
  showModal("Bind Device", `
    <form id="bind-device-form" onsubmit="bindDevice(event)">
      <div class="form-group">
        <label>MAC Address *</label>
        <input type="text" name="mac" placeholder="AA:BB:CC:DD:EE:FF" required
               pattern="([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}">
      </div>
      <div class="form-group">
        <label>Label</label>
        <input type="text" name="label" placeholder="e.g., Cold Truck 007">
      </div>
      <div class="form-actions">
        <button type="button" class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn-primary">Bind Device</button>
      </div>
    </form>
  `);
}

// Utility functions
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function formatDate(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString();
}

function formatDateTime(dateStr) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

function backToClientList() {
  adminPanelState.selectedClient = null;
  renderAdminPanel();
}

function switchClientTab(tab) {
  adminPanelState.clientTab = tab;
  renderAdminPanel();
}
```

### 4.2 CSS Additions (style.css)

```css
/* ================================================================
   Multi-tenant Admin Panel Styles
   ================================================================ */

.admin-container {
  display: flex;
  height: 100%;
  background: var(--bg-secondary);
}

.admin-sidebar {
  width: 220px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border);
  padding: 1rem 0;
}

.sidebar-header {
  padding: 0 1rem 1rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1rem;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0 0.5rem;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: none;
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  transition: background 0.2s;
}

.sidebar-item:hover {
  background: var(--bg-hover);
}

.sidebar-item.active {
  background: var(--accent);
  color: white;
}

.admin-main {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}

.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.admin-header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

/* Admin Table */
.admin-table-container {
  background: var(--bg-primary);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
}

.admin-table th,
.admin-table td {
  padding: 0.875rem 1rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.admin-table th {
  background: var(--bg-secondary);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.admin-table tbody tr:hover {
  background: var(--bg-hover);
}

.clickable-row {
  cursor: pointer;
}

/* Badges */
.badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: capitalize;
}

.badge.tier-free { background: #e5e7eb; color: #374151; }
.badge.tier-basic { background: #dbeafe; color: #1e40af; }
.badge.tier-pro { background: #fef3c7; color: #92400e; }
.badge.tier-enterprise { background: #ede9fe; color: #5b21b6; }

.badge.status-active { background: #d1fae5; color: #065f46; }
.badge.status-suspended { background: #fee2e2; color: #991b1b; }
.badge.status-pending { background: #fef3c7; color: #92400e; }
.badge.status-offline { background: #f3f4f6; color: #6b7280; }
.badge.status-online { background: #d1fae5; color: #065f46; }
.badge.status-idle { background: #fef3c7; color: #92400e; }

.badge.role-admin { background: #ede9fe; color: #5b21b6; }
.badge.role-operator { background: #dbeafe; color: #1e40af; }
.badge.role-user { background: #e5e7eb; color: #374151; }

.badge.action-create { background: #d1fae5; color: #065f46; }
.badge.action-update { background: #dbeafe; color: #1e40af; }
.badge.action-delete { background: #fee2e2; color: #991b1b; }
.badge.action-login { background: #fef3c7; color: #92400e; }

/* Client Tabs */
.client-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.5rem;
}

.tab-btn {
  padding: 0.5rem 1rem;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 6px;
  color: var(--text-muted);
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tab-btn.active {
  background: var(--accent);
  color: white;
}

/* Overview Grid */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.stat-card.large {
  flex-direction: column;
  text-align: center;
}

.stat-icon {
  font-size: 2rem;
}

.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.stat-bar {
  height: 4px;
  background: var(--bg-secondary);
  border-radius: 2px;
  margin-top: 0.5rem;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
}

/* Usage Chart */
.usage-chart {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
}

.chart-container {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 200px;
  padding: 1rem 0;
}

.chart-bar {
  flex: 1;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: height 0.3s;
}

.chart-bar:hover {
  opacity: 0.8;
}

.chart-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Forms */
.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.375rem;
  font-weight: 500;
  font-size: 0.875rem;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 0.9375rem;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.form-group textarea {
  min-height: 80px;
  resize: vertical;
}

.form-hint {
  font-size: 0.8125rem;
  color: var(--text-muted);
  margin: 0.5rem 0;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

/* Buttons */
.btn-primary {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-primary:hover {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border);
  padding: 0.625rem 1.25rem;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
}

.btn-back {
  background: transparent;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font-size: 0.9375rem;
}

.btn-icon {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  font-size: 1rem;
  opacity: 0.7;
  transition: opacity 0.2s;
}

.btn-icon:hover {
  opacity: 1;
}

/* Search Input */
.search-input {
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  min-width: 200px;
  background: var(--bg-primary);
}

/* Tab Header */
.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.tab-header h3 {
  margin: 0;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.info-item label {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-bottom: 0.25rem;
}

.client-info-section {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.5rem;
}

.client-info-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
}

/* Tier Distribution Chart */
.tier-chart {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tier-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.tier-label {
  width: 80px;
  text-transform: capitalize;
}

.tier-bar-container {
  flex: 1;
  height: 24px;
  background: var(--bg-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.tier-bar-fill {
  height: 100%;
  border-radius: 4px;
}

.tier-bar-fill.tier-free { background: #9ca3af; }
.tier-bar-fill.tier-basic { background: #3b82f6; }
.tier-bar-fill.tier-pro { background: #f59e0b; }
.tier-bar-fill.tier-enterprise { background: #8b5cf6; }

.tier-count {
  width: 30px;
  text-align: right;
  font-weight: 500;
}

/* Loading State */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: var(--text-muted);
}
```

---

## 5. Access Control Implementation

### 5.1 JWT Token Structure

**Admin JWT (Super Admin):**
```json
{
  "id": "admin-uuid",
  "username": "superadmin",
  "role": "superadmin",
  "type": "admin",
  "iat": 1679000000,
  "exp": 1679086400
}
```

**Tenant User JWT:**
```json
{
  "id": "user-uuid",
  "email": "user@tenant.com",
  "name": "John Doe",
  "client_id": "client-uuid",
  "client_name": "Acme Corp",
  "role": "operator",
  "permissions": ["devices:read", "devices:bind", "data:read"],
  "type": "tenant_user",
  "iat": 1679000000,
  "exp": 1679086400
}
```

### 5.2 Middleware Implementation

```javascript
// middleware/requireSuperAdmin.js
const { verifyToken, error } = require("../lib/auth");

async function requireSuperAdmin(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    error(res, "Unauthorized", 401, req);
    return null;
  }

  const payload = verifyToken(auth.slice(7));
  if (!payload || payload.type !== "admin") {
    error(res, "Unauthorized", 401, req);
    return null;
  }

  if (payload.role !== "superadmin") {
    error(res, "Forbidden: Super admin access required", 403, req);
    return null;
  }

  return payload;
}

module.exports = { requireSuperAdmin };

// middleware/requireTenantAuth.js
const { verifyToken, error } = require("../lib/auth");
const { supabase } = require("../lib/supabase");

async function requireTenantAuth(req, res) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    error(res, "Unauthorized", 401, req);
    return null;
  }

  const payload = verifyToken(auth.slice(7));
  if (!payload) {
    error(res, "Invalid token", 401, req);
    return null;
  }

  // Check if admin accessing on behalf of tenant
  if (payload.type === "admin") {
    const clientId = req.query.client_id || req.body?.client_id;
    if (!clientId) {
      error(res, "client_id required for admin access", 400, req);
      return null;
    }
    return { ...payload, client_id: clientId, is_admin_impersonation: true };
  }

  // Must be tenant_user
  if (payload.type !== "tenant_user") {
    error(res, "Unauthorized", 401, req);
    return null;
  }

  // Verify client is still active
  const { data: client } = await supabase
    .from("clients")
    .select("status")
    .eq("id", payload.client_id)
    .single();

  if (!client || client.status !== "active") {
    error(res, "Organization is suspended", 403, req);
    return null;
  }

  return payload;
}

module.exports = { requireTenantAuth };

// middleware/requirePermission.js
function requirePermission(permission) {
  return (req, res, next) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Super admin bypass
    if (user.type === "admin") {
      return next();
    }

    // Check permission
    if (!user.permissions?.includes(permission)) {
      return res.status(403).json({ error: "Permission denied" });
    }

    next();
  };
}

function hasPermission(user, permission) {
  if (!user) return false;
  if (user.type === "admin") return true;
  return user.permissions?.includes(permission);
}

module.exports = { requirePermission, hasPermission };

// lib/audit.js
const { supabase } = require("./supabase");

async function logAudit({
  actor_type,
  actor_id,
  actor_email,
  client_id,
  target_type,
  target_id,
  action,
  resource,
  old_values,
  new_values,
  metadata,
  ip_address,
  user_agent
}) {
  try {
    await supabase.from("audit_logs").insert({
      actor_type,
      actor_id,
      actor_email,
      client_id,
      target_type,
      target_id,
      action,
      resource,
      old_values,
      new_values,
      metadata: metadata || {},
      ip_address,
      user_agent
    });
  } catch (err) {
    console.error("Failed to log audit:", err);
  }
}

module.exports = { logAudit };
```

---

## 6. Sequence Diagrams

### 6.1 Tenant Admin Creates User

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Tenant Admin│    │  Frontend   │    │   Backend   │    │  Supabase   │    │Email Service│
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │                  │
       │  Click "Invite"  │                  │                  │                  │
       │─────────────────>│                  │                  │                  │
       │                  │                  │                  │                  │
       │                  │  Show Modal      │                  │                  │
       │                  │<─────────────────│                  │                  │
       │                  │                  │                  │                  │
       │  Fill form       │                  │                  │                  │
       │  Submit          │                  │                  │                  │
       │─────────────────>│                  │                  │                  │
       │                  │                  │                  │                  │
       │                  │  POST /tenant/   │                  │                  │
       │                  │  users           │                  │                  │
       │                  │  {email, name,   │                  │                  │
       │                  │   role}          │                  │                  │
       │                  │─────────────────>│                  │                  │
       │                  │                  │                  │                  │
       │                  │                  │  Verify JWT      │                  │
       │                  │                  │  Extract         │                  │
       │                  │                  │  client_id       │                  │
       │                  │                  │                  │                  │
       │                  │                  │  Check           │                  │
       │                  │                  │  permission      │                  │
       │                  │                  │  (users:create)  │                  │
       │                  │                  │                  │                  │
       │                  │                  │  Generate        │                  │
       │                  │                  │  invite_token    │                  │
       │                  │                  │                  │                  │
       │                  │                  │  INSERT          │                  │
       │                  │                  │  tenant_users    │                  │
       │                  │                  │─────────────────>│                  │
       │                  │                  │                  │                  │
       │                  │                  │     OK           │                  │
       │                  │                  │<─────────────────│                  │
       │                  │                  │                  │                  │
       │                  │                  │  INSERT          │                  │
       │                  │                  │  audit_logs      │                  │
       │                  │                  │─────────────────>│                  │
       │                  │                  │                  │                  │
       │                  │                  │  Send invitation │                  │
       │                  │                  │─────────────────────────────────────>│
       │                  │                  │                  │                  │
       │                  │  201 Created     │                  │                  │
       │                  │  {user}          │                  │                  │
       │                  │<─────────────────│                  │                  │
       │                  │                  │                  │                  │
       │  Show success    │                  │                  │                  │
       │  toast           │                  │                  │                  │
       │<─────────────────│                  │                  │                  │
       │                  │                  │                  │                  │
       │  Reload user     │                  │                  │                  │
       │  list            │                  │                  │                  │
       │                  │─────────────────>│                  │                  │
       │                  │                  │                  │                  │
```

### 6.2 Super Admin Views Cross-Tenant Analytics

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Super Admin │    │  Frontend   │    │   Backend   │    │  Supabase   │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       │  Click Analytics │                  │                  │
       │─────────────────>│                  │                  │
       │                  │                  │                  │
       │                  │  switchAdminView │                  │
       │                  │  ('analytics')   │                  │
       │                  │                  │                  │
       │                  │  GET /admin/     │                  │
       │                  │  analytics/      │                  │
       │                  │  overview        │                  │
       │                  │─────────────────>│                  │
       │                  │                  │                  │
       │                  │                  │  Verify JWT      │
       │                  │                  │  (must be        │
       │                  │                  │   superadmin)    │
       │                  │                  │                  │
       │                  │                  │  Query clients   │
       │                  │                  │  (COUNT)         │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  Query tenant_   │
       │                  │                  │  users (COUNT)   │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  Query client_   │
       │                  │                  │  tags (COUNT)    │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  Query usage_    │
       │                  │                  │  daily (SUM)     │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  Aggregate       │
       │                  │                  │  tier dist       │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │  200 OK          │                  │
       │                  │  {summary,       │                  │
       │                  │   tier_dist}     │                  │
       │                  │<─────────────────│                  │
       │                  │                  │                  │
       │                  │  renderPlatform  │                  │
       │                  │  Analytics()     │                  │
       │                  │                  │                  │
       │  Display charts  │                  │                  │
       │  and stats       │                  │                  │
       │<─────────────────│                  │                  │
       │                  │                  │                  │
```

### 6.3 Tenant User Login Flow

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Tenant User │    │  Frontend   │    │   Backend   │    │  Supabase   │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │                  │
       │  Enter email/pwd │                  │                  │
       │  Click Login     │                  │                  │
       │─────────────────>│                  │                  │
       │                  │                  │                  │
       │                  │  POST /tenant/   │                  │
       │                  │  auth/login      │                  │
       │                  │─────────────────>│                  │
       │                  │                  │                  │
       │                  │                  │  SELECT          │
       │                  │                  │  tenant_users    │
       │                  │                  │  JOIN clients    │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  Check client    │
       │                  │                  │  status          │
       │                  │                  │                  │
       │                  │                  │  Check account   │
       │                  │                  │  lock            │
       │                  │                  │                  │
       │                  │                  │  bcrypt.compare  │
       │                  │                  │  (password)      │
       │                  │                  │                  │
       │                  │                  │  UPDATE          │
       │                  │                  │  login_count,    │
       │                  │                  │  last_login_at   │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  SELECT          │
       │                  │                  │  role_permissions│
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │                  │  Sign JWT with   │
       │                  │                  │  {id, email,     │
       │                  │                  │   client_id,     │
       │                  │                  │   role,          │
       │                  │                  │   permissions}   │
       │                  │                  │                  │
       │                  │                  │  INSERT          │
       │                  │                  │  audit_logs      │
       │                  │                  │  (login)         │
       │                  │                  │─────────────────>│
       │                  │                  │                  │
       │                  │  200 OK          │                  │
       │                  │  {token, user,   │                  │
       │                  │   permissions}   │                  │
       │                  │<─────────────────│                  │
       │                  │                  │                  │
       │                  │  Store token     │                  │
       │                  │  localStorage    │                  │
       │                  │                  │                  │
       │                  │  Redirect to     │                  │
       │                  │  tenant dashboard│                  │
       │                  │                  │                  │
       │  Dashboard loads │                  │                  │
       │<─────────────────│                  │                  │
       │                  │                  │                  │
```

---

## Summary

This System Design Document provides a comprehensive blueprint for implementing Phase 3 Multi-tenant Management in UTtag. Key components include:

1. **Architecture:** Shared database with row-level tenant isolation using `client_id`
2. **Database:** New tables for `tenant_users`, `permissions`, `role_permissions`, `audit_logs`, and `tenant_settings` with proper RLS policies
3. **Backend:** Admin APIs (`/api/admin/*`) for super admins and Tenant APIs (`/api/tenant/*`) for tenant users
4. **Frontend:** Admin panel with client list, detail views, user/device/key management, and analytics
5. **Access Control:** JWT-based authentication with embedded permissions, middleware for role checking
6. **Audit:** Comprehensive logging of all administrative actions

This design maintains backward compatibility with existing APIs while adding the new multi-tenant management capabilities specified in the PRD.
