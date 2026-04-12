# Product Requirements Document (PRD)
# Phase 3: Multi-tenant Management Interface (多租戶管理介面)

**Document Version:** 1.0
**Last Updated:** 2026-03-18
**Author:** PM Agent
**Status:** Draft
**Project:** UTtag - IoT Cold Chain Tracking Dashboard

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Goals & Objectives](#3-goals--objectives)
4. [User Stories](#4-user-stories)
5. [Feature Scope](#5-feature-scope)
6. [Data Model](#6-data-model)
7. [Admin UI Pages](#7-admin-ui-pages)
8. [Access Control](#8-access-control)
9. [API Specifications](#9-api-specifications)
10. [Technical Architecture](#10-technical-architecture)
11. [Success Metrics](#11-success-metrics)
12. [Out of Scope](#12-out-of-scope)
13. [Timeline & Milestones](#13-timeline--milestones)
14. [Dependencies & Risks](#14-dependencies--risks)
15. [Appendix](#appendix)

---

## 1. Executive Summary

### Overview
Phase 3 introduces a comprehensive multi-tenant management interface for the UTtag platform, enabling B2B SaaS deployment where multiple client organizations (tenants) can be managed from a centralized admin dashboard. Each tenant has isolated data, dedicated users, devices/tags, and API keys, while super administrators maintain full system visibility and control.

### Business Value
- **Scalable B2B Model:** Support multiple enterprise clients on a single platform
- **Data Isolation:** Ensure complete separation of tenant data for security and compliance
- **Centralized Management:** Reduce operational overhead with unified admin tools
- **Self-service Capability:** Enable tenant admins to manage their own organizations
- **Revenue Growth:** Foundation for tiered pricing and usage-based billing

### Target Users
- **Super Admin (System Administrator):** Full platform management across all tenants
- **Tenant Admin (Client Organization Manager):** Manage own organization's users, devices, and settings
- **Tenant User (Client End User):** View and interact with own organization's data

### Relationship to Existing System
The UTtag platform already has foundational multi-tenant support:
- `clients` table exists with tier, status, max_tags, max_keys
- `api_keys` table links to clients via `client_id`
- `client_tags` table binds MAC addresses to clients
- `admins` table has `superadmin` and `admin` roles

Phase 3 extends this foundation with:
- User management within tenants (tenant-scoped users)
- Comprehensive admin UI for all CRUD operations
- Role-based access control (RBAC)
- Usage analytics per tenant

---

## 2. Problem Statement

### Current Situation
UTtag currently operates with limited multi-tenant infrastructure:
1. Clients (tenants) can be created via API but lack a management UI
2. No user management within client organizations
3. Device/tag bindings require direct database manipulation
4. API keys are managed ad-hoc without visibility
5. No tenant-level usage analytics or dashboards

### Pain Points

| Pain Point | Impact | Severity |
|------------|--------|----------|
| No self-service for tenant admins | High support burden, slow onboarding | Critical |
| Manual device binding process | Error-prone, time-consuming | High |
| Lack of visibility into tenant usage | Cannot optimize resources or billing | High |
| No user management within tenants | Security risk, no accountability | Critical |
| Single admin role limitation | Cannot delegate responsibilities | Medium |
| No audit trail for tenant actions | Compliance and debugging issues | High |

### Business Drivers

**Market Demand:**
- Enterprise clients require self-service administration
- Compliance requirements mandate tenant data isolation
- Competitors offer multi-tenant SaaS solutions

**Operational Efficiency:**
- Current support burden: 5+ hours/week on manual tenant management
- Average time to onboard new client: 2-3 days (manual process)
- Target: Reduce onboarding to <30 minutes with self-service

### User Quotes
> "I need to add new employees to our account, but I have to email support every time." - Tenant Admin

> "We can't tell which client is consuming the most API calls without querying the database directly." - System Admin

> "Our compliance team requires a full audit log of who accessed what data and when." - Enterprise Client

---

## 3. Goals & Objectives

### Primary Goals
1. **Enable B2B Self-service:** Tenant admins can fully manage their organization without support intervention
2. **Ensure Data Isolation:** Complete separation of tenant data at application and database levels
3. **Provide Centralized Oversight:** Super admins have full visibility and control across all tenants
4. **Support Scalable Growth:** Architecture supports 100+ tenants without performance degradation

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tenant onboarding time | <30 minutes | Time tracking |
| Support tickets for tenant management | -80% reduction | Support system |
| Tenant admin self-service rate | 90%+ | Feature usage logs |
| System admin efficiency | 2x improvement | Task completion time |
| Tenant data isolation | 100% verified | Security audit |

### Non-Goals (This Phase)
- Billing and payment processing (Phase 4+)
- Custom domain per tenant (Phase 5+)
- SSO integration (SAML, OAuth) (Phase 5+)
- White-label branding per tenant (Phase 4)
- Mobile app for tenant management (Future)

---

## 4. User Stories

### Epic 1: Client/Tenant Management

#### US-3.1: Create New Tenant
**As a** super admin
**I want to** create a new client organization from the admin dashboard
**So that** I can onboard new B2B customers quickly

**Acceptance Criteria:**
- [ ] Form to enter: name, email, company, phone, tier, notes
- [ ] Tier selection auto-populates max_tags, max_keys from billing_tiers
- [ ] Validation prevents duplicate emails
- [ ] Success notification with client ID
- [ ] New client appears in client list immediately

#### US-3.2: View and Filter Client List
**As a** super admin
**I want to** view all clients with filtering and search capabilities
**So that** I can quickly find and manage specific tenants

**Acceptance Criteria:**
- [ ] List view with columns: Name, Company, Tier, Status, Tags Used, Keys, Created
- [ ] Filter by: status (active/suspended), tier (free/basic/pro/enterprise)
- [ ] Search by: name, email, company
- [ ] Pagination for large client lists (50+ per page)
- [ ] Sort by any column

#### US-3.3: Edit Client Details
**As a** super admin
**I want to** modify client information and settings
**So that** I can update tiers, quotas, and status as needed

**Acceptance Criteria:**
- [ ] Edit form pre-populated with current values
- [ ] Can upgrade/downgrade tier
- [ ] Can adjust max_tags and max_keys independently
- [ ] Can change status (active/suspended/deleted)
- [ ] Audit log entry created on save

#### US-3.4: Suspend/Reactivate Client
**As a** super admin
**I want to** suspend a client's access temporarily
**So that** I can handle non-payment or policy violations without deleting data

**Acceptance Criteria:**
- [ ] Suspend action sets status to 'suspended'
- [ ] Suspended clients cannot authenticate
- [ ] API keys for suspended clients are rejected
- [ ] Reactivate action restores 'active' status
- [ ] Confirmation modal before suspend action

---

### Epic 2: Tenant-Scoped User Management

#### US-3.5: Add User to Tenant
**As a** tenant admin
**I want to** add new users to my organization
**So that** my team members can access the platform

**Acceptance Criteria:**
- [ ] Form to enter: name, email, role (admin/operator/user)
- [ ] Email invitation sent to new user
- [ ] User appears in organization's user list
- [ ] User inherits organization's permissions scope
- [ ] Cannot add more users than tier allows (if limited)

#### US-3.6: Manage User Roles
**As a** tenant admin
**I want to** change user roles within my organization
**So that** I can adjust permissions as responsibilities change

**Acceptance Criteria:**
- [ ] Can change role: admin, operator, user
- [ ] Admin: full org management
- [ ] Operator: manage devices/tags, view reports
- [ ] User: view-only access
- [ ] Cannot demote self from admin if only admin

#### US-3.7: Remove User from Tenant
**As a** tenant admin
**I want to** remove users who have left the organization
**So that** they no longer have access to our data

**Acceptance Criteria:**
- [ ] Confirmation modal before removal
- [ ] User loses access immediately
- [ ] User's actions remain in audit log
- [ ] User can be re-added later if needed

#### US-3.8: View All Tenant Users (Super Admin)
**As a** super admin
**I want to** view users across all tenants
**So that** I can audit access and troubleshoot issues

**Acceptance Criteria:**
- [ ] Cross-tenant user list with organization column
- [ ] Filter by tenant, role, status
- [ ] Can impersonate user for support (with audit log)
- [ ] Can force password reset for any user

---

### Epic 3: Tenant-Scoped Device/Tag Management

#### US-3.9: Bind Device to Tenant
**As a** tenant admin
**I want to** bind IoT tags/devices to my organization
**So that** only my organization sees data from these devices

**Acceptance Criteria:**
- [ ] Enter MAC address to bind
- [ ] Optional: label/name for the device
- [ ] Validates MAC format
- [ ] Checks max_tags quota
- [ ] Device data immediately visible in org dashboard

#### US-3.10: Unbind Device
**As a** tenant admin
**I want to** unbind devices that are no longer in use
**So that** I can free up quota for new devices

**Acceptance Criteria:**
- [ ] Confirmation modal before unbind
- [ ] Historical data remains associated with tenant
- [ ] Device can be re-bound to same or different tenant
- [ ] Quota is freed immediately

#### US-3.11: View Device List with Status
**As a** tenant admin
**I want to** see all my organization's devices with their current status
**So that** I can monitor device health and activity

**Acceptance Criteria:**
- [ ] List shows: MAC, Label, Last Seen, Status, Temp (latest)
- [ ] Status: online (seen <5min), idle (5-60min), offline (>60min)
- [ ] Can filter by status
- [ ] Click to view device detail/history

#### US-3.12: Bulk Device Import
**As a** tenant admin
**I want to** import multiple devices via CSV
**So that** I can onboard large deployments efficiently

**Acceptance Criteria:**
- [ ] CSV template download
- [ ] Upload and preview before import
- [ ] Validation with error reporting
- [ ] Skips duplicates with warning
- [ ] Progress indicator for large imports

---

### Epic 4: API Key Management

#### US-3.13: Create API Key for Tenant
**As a** tenant admin
**I want to** generate API keys for my organization
**So that** our systems can integrate with UTtag

**Acceptance Criteria:**
- [ ] Name/description for the key
- [ ] Permission selection (read, write, admin)
- [ ] Rate limit and daily limit configuration
- [ ] Optional expiration date
- [ ] Key displayed once, must copy immediately
- [ ] Quota check against max_keys

#### US-3.14: View and Manage API Keys
**As a** tenant admin
**I want to** view all my organization's API keys with usage
**So that** I can monitor and manage integrations

**Acceptance Criteria:**
- [ ] List shows: Name, Key (partial), Permissions, Status, Last Used, Created
- [ ] Usage stats: requests today, errors, rate
- [ ] Can revoke key (with confirmation)
- [ ] Can regenerate key (creates new, revokes old)

#### US-3.15: Cross-Tenant API Key Overview
**As a** super admin
**I want to** view API keys across all tenants
**So that** I can monitor platform usage and identify issues

**Acceptance Criteria:**
- [ ] Aggregated key list with tenant column
- [ ] Filter by tenant, status, permission level
- [ ] Sort by usage, last used, created
- [ ] Can revoke any key (emergency response)

---

### Epic 5: Usage Analytics Dashboard

#### US-3.16: Tenant Usage Dashboard
**As a** tenant admin
**I want to** view my organization's usage statistics
**So that** I can monitor consumption and plan capacity

**Acceptance Criteria:**
- [ ] Summary: total API calls, devices active, users
- [ ] Charts: daily API usage, device activity
- [ ] Period selection: 7d, 30d, 90d
- [ ] Export usage data as CSV
- [ ] Quota indicators with warnings

#### US-3.17: Cross-Tenant Analytics
**As a** super admin
**I want to** view aggregated usage across all tenants
**So that** I can understand platform utilization and growth

**Acceptance Criteria:**
- [ ] Overview: total tenants, users, devices, API calls
- [ ] Top 10 tenants by usage
- [ ] Tenant growth trend (new tenants over time)
- [ ] Tier distribution pie chart
- [ ] Revenue projection (if billing data available)

#### US-3.18: Usage Alerts and Quotas
**As a** tenant admin
**I want to** receive alerts when approaching usage limits
**So that** I can take action before hitting hard limits

**Acceptance Criteria:**
- [ ] Alert at 80% and 95% of quota
- [ ] In-app notification
- [ ] Email notification (configurable)
- [ ] Upgrade suggestion with one-click path

---

## 5. Feature Scope

### MVP (Must Have) - Phase 3a

| Feature | Description | Priority |
|---------|-------------|----------|
| Client CRUD UI | Create, read, update, delete tenant organizations | P0 |
| Client List/Details | Searchable, filterable tenant list with detail view | P0 |
| User Management Schema | Database tables for tenant-scoped users | P0 |
| User CRUD API | API endpoints for user management | P0 |
| User Management UI | Tenant admin can add/edit/remove users | P0 |
| Device Binding UI | Tenant admin can bind/unbind tags | P0 |
| API Key Management UI | Full key lifecycle management | P0 |
| Basic Usage Dashboard | Usage stats per tenant | P0 |
| Access Control Enforcement | Tenant isolation at API level | P0 |

### Phase 3b (Should Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| Role-Based Access Control | Granular permissions system | P1 |
| Bulk Device Import | CSV import for devices | P1 |
| Cross-Tenant Analytics | Super admin aggregated views | P1 |
| Audit Logging | Track all admin actions | P1 |
| Usage Alerts | Quota warning notifications | P1 |
| User Invitation Flow | Email invites with signup link | P1 |

### Phase 3c (Nice to Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| Quota Management UI | Visual quota configuration | P2 |
| Billing Integration Hooks | Stripe/payment provider prep | P2 |
| White-label Branding | Logo, colors per tenant | P2 |
| API for Tenant Management | Programmatic tenant CRUD | P2 |
| Impersonation Mode | Super admin can view as tenant | P3 |

---

## 6. Data Model

### Existing Tables (Already Implemented)

```
clients (organizations/tenants)
├── id UUID PRIMARY KEY
├── name TEXT NOT NULL
├── email TEXT UNIQUE NOT NULL
├── company TEXT
├── phone TEXT
├── tier TEXT DEFAULT 'free' ('free','basic','pro','enterprise')
├── status TEXT DEFAULT 'active' ('active','suspended','deleted')
├── max_tags INTEGER DEFAULT 10
├── max_keys INTEGER DEFAULT 2
├── notes TEXT
├── created_at TIMESTAMPTZ
└── updated_at TIMESTAMPTZ

api_keys
├── id UUID PRIMARY KEY
├── client_id UUID FK -> clients
├── key TEXT UNIQUE NOT NULL
├── name TEXT DEFAULT 'Default'
├── permissions TEXT[] DEFAULT ['read']
├── rate_limit INTEGER DEFAULT 60
├── daily_limit INTEGER DEFAULT 1000
├── status TEXT DEFAULT 'active'
├── expires_at TIMESTAMPTZ
├── last_used_at TIMESTAMPTZ
└── created_at TIMESTAMPTZ

client_tags (device bindings)
├── id UUID PRIMARY KEY
├── client_id UUID FK -> clients
├── mac TEXT NOT NULL
├── label TEXT
├── created_at TIMESTAMPTZ
└── UNIQUE(client_id, mac)

admins (system administrators)
├── id UUID PRIMARY KEY
├── username TEXT UNIQUE NOT NULL
├── password_hash TEXT NOT NULL
├── role TEXT DEFAULT 'admin' ('superadmin','admin')
└── created_at TIMESTAMPTZ

billing_tiers
├── tier TEXT PRIMARY KEY
├── name TEXT NOT NULL
├── price_monthly INTEGER
├── max_tags INTEGER
├── max_keys INTEGER
├── rate_limit INTEGER
├── daily_limit INTEGER
└── features JSONB
```

### New Tables (Phase 3)

```sql
-- ============================================
-- Phase 3: Multi-tenant User Management
-- ============================================

-- Tenant Users (users within client organizations)
CREATE TABLE tenant_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- User Identity
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT,

  -- Role within tenant
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

-- Permissions (RBAC)
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

-- Indexes
CREATE INDEX idx_tenant_users_client ON tenant_users(client_id);
CREATE INDEX idx_tenant_users_email ON tenant_users(email);
CREATE INDEX idx_tenant_users_status ON tenant_users(status);
CREATE INDEX idx_audit_logs_client ON audit_logs(client_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_type, actor_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, action);

-- Trigger for updated_at
CREATE TRIGGER tenant_users_updated_at
  BEFORE UPDATE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Default Permissions Data

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
INSERT INTO role_permissions (role, permission_id)
SELECT 'admin', id FROM permissions;  -- Admin gets all permissions

INSERT INTO role_permissions (role, permission_id)
SELECT 'operator', id FROM permissions
WHERE code IN (
  'users:read', 'devices:read', 'devices:bind', 'devices:unbind', 'devices:update',
  'data:read', 'data:export', 'reports:read', 'reports:create',
  'apikeys:read', 'settings:read', 'analytics:read'
);

INSERT INTO role_permissions (role, permission_id)
SELECT 'user', id FROM permissions
WHERE code IN ('devices:read', 'data:read', 'reports:read', 'analytics:read');
```

### Entity Relationship Diagram

```
                                 ┌─────────────────┐
                                 │     admins      │
                                 │  (super admin)  │
                                 └────────┬────────┘
                                          │ manages
                                          ▼
┌──────────────┐         ┌─────────────────────────────────┐
│ billing_tiers │◀────────│           clients               │
└──────────────┘         │     (organizations/tenants)      │
                         └────────┬────────┬────────┬───────┘
                                  │        │        │
          ┌───────────────────────┘        │        └───────────────────┐
          │                                │                            │
          ▼                                ▼                            ▼
┌─────────────────┐              ┌─────────────────┐           ┌──────────────┐
│  tenant_users   │              │   client_tags   │           │   api_keys   │
│ (users in org)  │              │ (device bindings)│           │              │
└────────┬────────┘              └─────────────────┘           └──────────────┘
         │
         │ performs actions
         ▼
┌─────────────────┐              ┌─────────────────┐
│   audit_logs    │              │ tenant_settings │
│                 │              │                 │
└─────────────────┘              └─────────────────┘
```

---

## 7. Admin UI Pages

### Navigation Structure

```
UTtag Admin
├── Dashboard (existing)
├── Tags (existing)
├── Devices (existing)
├── Chat (existing)
├── Reports (Phase 2)
│
├── Tenants (Phase 3) ─────────────────────────────┐
│   ├── Client List                                │
│   ├── Client Details                             │
│   │   ├── Overview                               │
│   │   ├── Users                                  │
│   │   ├── Devices                                │
│   │   ├── API Keys                               │
│   │   ├── Usage                                  │
│   │   └── Settings                               │
│   └── Create Client                              │
│                                                   │
├── Users (Phase 3) ─────────────────────────────────┤
│   └── All Users (cross-tenant view for super admin)│
│                                                   │
├── Analytics (Phase 3) ──────────────────────────────┤
│   ├── Platform Overview                          │
│   ├── Tenant Usage                               │
│   └── API Usage                                  │
│                                                   │
└── Settings (existing)                             │
    └── Audit Log (Phase 3) ─────────────────────────┘
```

### 7.1 Client List Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Tenants                                                    [+ Create Client] │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search clients...          Status: ▼ All    Tier: ▼ All    [Export CSV] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Name ▼           Company          Tier      Status   Tags   Keys  Created│ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ Acme Logistics   Acme Corp        Pro       Active   45/500  3/20  2025-12│ │
│ │ Beta Foods       Beta Inc         Basic     Active   12/100  2/5   2026-01│ │
│ │ Cold Chain Co    Cold Chain LLC   Enterprise Active  ∞/∞    10/∞  2026-02│ │
│ │ Demo Client      (Demo)           Free      Active   5/10   1/2   2026-03│ │
│ │ Frozen Express   Frozen Ltd       Basic     Suspended 0/100  0/5  2026-01│ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Showing 1-5 of 23 clients                              [< 1 2 3 4 5 >]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Client Details Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Clients                                                            │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  ACME Logistics                                     Status: 🟢 Active    │ │
│ │  Acme Corp | contact@acme.com | +886-2-1234-5678                        │ │
│ │  Tier: Pro | Created: 2025-12-01                              [Edit]    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ [Overview] [Users] [Devices] [API Keys] [Usage] [Settings]              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─────────────────────────────────┐  ┌─────────────────────────────────────┐│
│ │ Users              3 / 20       │  │ Devices              45 / 500      ││
│ │ ████████░░░░░░░░░░░░░ 15%       │  │ ████░░░░░░░░░░░░░░░░ 9%            ││
│ │ 2 admin, 1 operator             │  │ 40 online, 5 offline               ││
│ └─────────────────────────────────┘  └─────────────────────────────────────┘│
│                                                                              │
│ ┌─────────────────────────────────┐  ┌─────────────────────────────────────┐│
│ │ API Keys           3 / 20       │  │ API Calls (30d)       12,450       ││
│ │ ████░░░░░░░░░░░░░░░░ 15%        │  │ ████████████░░░░░░░░ 62%           ││
│ │ 2 active, 1 revoked             │  │ Limit: 20,000/month                ││
│ └─────────────────────────────────┘  └─────────────────────────────────────┘│
│                                                                              │
│ Recent Activity                                                              │
│ ─────────────────────────────────────────────────────────────────────────── │
│ • john@acme.com logged in                              2 minutes ago        │
│ • New device bound: COLD-TRUCK-007                     1 hour ago           │
│ • API key "Production" created                         Yesterday            │
│ • mary@acme.com added as operator                      3 days ago           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.3 Users Tab (within Client Details)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Users                                                     [+ Invite User]   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔍 Search users...                            Role: ▼ All    Status: ▼ All │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Name              Email                  Role        Status    Last Login│ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ John Chen         john@acme.com          Admin       Active    2 min ago │ │
│ │ Mary Wang         mary@acme.com          Operator    Active    1 hour ago│ │
│ │ Bob Lin           bob@acme.com           User        Pending   Never     │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Showing 3 users                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Invite User Modal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Invite User to Acme Logistics                                          [✕]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Email *                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ newuser@acme.com                                                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Name *                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ New User                                                                ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  Role *                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ ○ Admin     - Full organization management                              ││
│  │ ○ Operator  - Manage devices, view reports                              ││
│  │ ● User      - View-only access                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ℹ️ An invitation email will be sent to the user with a signup link.        │
│                                                                              │
│                                              [Cancel]  [Send Invitation]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.5 API Keys Tab

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ API Keys                                                   [+ Create Key]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ Name            Key              Permissions  Rate Limit  Status  Last   │ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ Production      utk_abc...xyz    read,write   60/min      Active  5m ago │ │
│ │ Development     utk_def...uvw    read         30/min      Active  1d ago │ │
│ │ Legacy          utk_ghi...rst    read         60/min      Revoked Never  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ Usage (Last 7 Days)                                                         │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │     1.5k │    ░░░░░░░░░▓▓▓▓▓▓▓▓█████████████████████                    │ │
│ │     1.0k │    ░░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓█████████████████████████            │ │
│ │     0.5k │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓███████████████████████████    │ │
│ │       0  │────────────────────────────────────────────────────────      │ │
│ │          Mon   Tue   Wed   Thu   Fri   Sat   Sun                        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.6 Platform Analytics (Super Admin)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Platform Analytics                                          Period: ▼ 30d   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
│ │ Total Tenants │  │ Active Users  │  │ Total Devices │  │ API Calls     │ │
│ │      23       │  │     156       │  │    1,245      │  │   245,678     │ │
│ │    ↑ 12%      │  │    ↑ 8%       │  │    ↑ 15%      │  │    ↑ 22%      │ │
│ └───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘ │
│                                                                              │
│ Top Tenants by Usage                      Tier Distribution                 │
│ ┌─────────────────────────────────────┐  ┌─────────────────────────────────┐│
│ │ 1. Acme Logistics      45,230 calls │  │        Free: 8 (35%)            ││
│ │ 2. Cold Chain Co       38,102 calls │  │       Basic: 9 (39%)            ││
│ │ 3. Beta Foods          22,456 calls │  │         Pro: 4 (17%)            ││
│ │ 4. Frozen Express      18,234 calls │  │  Enterprise: 2 (9%)             ││
│ │ 5. Fresh Mart          12,345 calls │  │                                 ││
│ └─────────────────────────────────────┘  └─────────────────────────────────┘│
│                                                                              │
│ Tenant Growth                                                                │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │  25 │                                                      ████████████ │ │
│ │  20 │                                        ████████████████████████   │ │
│ │  15 │                          ████████████████████████████████████     │ │
│ │  10 │        ████████████████████████████████████████████████████       │ │
│ │   5 │████████████████████████████████████████████████████████████       │ │
│ │   0 │───────────────────────────────────────────────────────────        │ │
│ │     Dec    Jan    Feb    Mar                                            │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Access Control

### Role Hierarchy

```
                    ┌─────────────────┐
                    │   Super Admin   │
                    │  (System-wide)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ Tenant A    │  │ Tenant B    │  │ Tenant C    │
    │ Admin       │  │ Admin       │  │ Admin       │
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
    ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
    │ Operators   │  │ Operators   │  │ Operators   │
    │ Users       │  │ Users       │  │ Users       │
    └─────────────┘  └─────────────┘  └─────────────┘
```

### Permission Matrix

| Resource / Action | Super Admin | Tenant Admin | Operator | User |
|-------------------|:-----------:|:------------:|:--------:|:----:|
| **Clients** |
| Create tenant | ✓ | - | - | - |
| View all tenants | ✓ | - | - | - |
| Edit any tenant | ✓ | - | - | - |
| Delete tenant | ✓ | - | - | - |
| **Users** |
| View users (own org) | ✓ | ✓ | ✓ | - |
| Create users (own org) | ✓ | ✓ | - | - |
| Edit users (own org) | ✓ | ✓ | - | - |
| Delete users (own org) | ✓ | ✓ | - | - |
| View users (all orgs) | ✓ | - | - | - |
| **Devices** |
| View devices (own org) | ✓ | ✓ | ✓ | ✓ |
| Bind devices (own org) | ✓ | ✓ | ✓ | - |
| Unbind devices (own org) | ✓ | ✓ | ✓ | - |
| **API Keys** |
| View keys (own org) | ✓ | ✓ | ✓ | - |
| Create keys (own org) | ✓ | ✓ | - | - |
| Revoke keys (own org) | ✓ | ✓ | - | - |
| View keys (all orgs) | ✓ | - | - | - |
| **Data** |
| View sensor data (own org) | ✓ | ✓ | ✓ | ✓ |
| Export data (own org) | ✓ | ✓ | ✓ | - |
| **Analytics** |
| View usage (own org) | ✓ | ✓ | ✓ | ✓ |
| View usage (all orgs) | ✓ | - | - | - |
| **Settings** |
| Edit org settings | ✓ | ✓ | - | - |
| View audit log (own org) | ✓ | ✓ | - | - |
| View audit log (all orgs) | ✓ | - | - | - |

### Data Isolation Rules

1. **Database Level:**
   - All tenant-scoped queries must include `client_id` filter
   - RLS (Row Level Security) policies on tenant tables
   - Foreign key constraints ensure referential integrity

2. **API Level:**
   - Middleware validates `client_id` on every request
   - Tenant users can only access their organization's data
   - Super admins can specify `client_id` to access any tenant

3. **UI Level:**
   - Navigation scoped to user's permissions
   - Cross-tenant views only visible to super admins
   - Client selector for super admins when impersonating

### Authentication Flow

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Login     │──────▶│  Verify     │──────▶│  Generate   │
│   Request   │       │  Credentials│       │  JWT Token  │
└─────────────┘       └─────────────┘       └──────┬──────┘
                                                    │
                                                    ▼
                                            ┌─────────────┐
                                            │ JWT Contains│
                                            │ - user_id   │
                                            │ - client_id │
                                            │ - role      │
                                            │ - permissions│
                                            └─────────────┘
```

**JWT Token Payload (Tenant User):**
```json
{
  "sub": "user-uuid",
  "client_id": "client-uuid",
  "email": "user@tenant.com",
  "role": "operator",
  "permissions": ["devices:read", "devices:bind", "data:read"],
  "iat": 1679000000,
  "exp": 1679086400
}
```

---

## 9. API Specifications

### Base URLs

```
Admin API:    /api/admin/*     (Super Admin only)
Tenant API:   /api/tenant/*    (Tenant Users)
Public API:   /api/v1/*        (API Key authentication)
```

### 9.1 Client Management (Super Admin)

#### GET /api/admin/clients
List all clients with filtering.

**Request:**
```http
GET /api/admin/clients?status=active&tier=pro&search=acme HTTP/1.1
Authorization: Bearer <admin-token>
```

**Response (200 OK):**
```json
{
  "clients": [
    {
      "id": "uuid-123",
      "name": "Acme Logistics",
      "email": "contact@acme.com",
      "company": "Acme Corp",
      "tier": "pro",
      "status": "active",
      "max_tags": 500,
      "max_keys": 20,
      "tags_used": 45,
      "keys_used": 3,
      "users_count": 5,
      "created_at": "2025-12-01T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 50
}
```

#### POST /api/admin/clients
Create new client.

**Request:**
```http
POST /api/admin/clients HTTP/1.1
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "name": "New Client",
  "email": "contact@newclient.com",
  "company": "New Client Inc",
  "phone": "+886-2-1234-5678",
  "tier": "basic",
  "notes": "Referred by Acme"
}
```

#### PUT /api/admin/clients/:id
Update client.

#### DELETE /api/admin/clients/:id
Soft-delete client (status = 'deleted').

### 9.2 Tenant User Management

#### GET /api/admin/clients/:clientId/users
List users for a specific client.

#### POST /api/admin/clients/:clientId/users
Create/invite user to client.

**Request:**
```http
POST /api/admin/clients/uuid-123/users HTTP/1.1
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "email": "newuser@acme.com",
  "name": "New User",
  "role": "operator",
  "send_invite": true
}
```

#### PUT /api/admin/clients/:clientId/users/:userId
Update user.

#### DELETE /api/admin/clients/:clientId/users/:userId
Remove user from client.

### 9.3 Tenant-Scoped APIs

#### GET /api/tenant/users
List users in current tenant (from JWT).

#### POST /api/tenant/users
Create user in current tenant (admin/operator only).

#### GET /api/tenant/devices
List devices bound to current tenant.

#### POST /api/tenant/devices
Bind device to current tenant.

**Request:**
```http
POST /api/tenant/devices HTTP/1.1
Authorization: Bearer <tenant-user-token>
Content-Type: application/json

{
  "mac": "AA:BB:CC:DD:EE:01",
  "label": "Cold Truck 007"
}
```

#### DELETE /api/tenant/devices/:mac
Unbind device.

#### GET /api/tenant/api-keys
List API keys for current tenant.

#### POST /api/tenant/api-keys
Create API key.

#### DELETE /api/tenant/api-keys/:keyId
Revoke API key.

#### GET /api/tenant/usage
Get usage statistics for current tenant.

**Response:**
```json
{
  "summary": {
    "devices_bound": 45,
    "devices_limit": 500,
    "users_count": 5,
    "api_keys_active": 3,
    "api_calls_30d": 12450,
    "api_calls_limit": 50000
  },
  "daily_usage": [
    {"date": "2026-03-17", "calls": 450, "errors": 2},
    {"date": "2026-03-16", "calls": 520, "errors": 0}
  ]
}
```

### 9.4 Analytics APIs (Super Admin)

#### GET /api/admin/analytics/overview
Platform-wide statistics.

#### GET /api/admin/analytics/tenants
Top tenants by usage.

#### GET /api/admin/audit-logs
Query audit logs.

**Request:**
```http
GET /api/admin/audit-logs?client_id=uuid-123&action=create&resource=tenant_users&limit=100 HTTP/1.1
Authorization: Bearer <admin-token>
```

---

## 10. Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           UTtag Multi-tenant Platform                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                         Frontend (Vanilla JS)                           ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            ││
│  │  │ Admin UI  │  │ Tenant UI │  │ Dashboard │  │ Analytics │            ││
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘            ││
│  └────────┼──────────────┼──────────────┼──────────────┼────────────────────┘│
│           │              │              │              │                     │
│           └──────────────┼──────────────┼──────────────┘                     │
│                          │              │                                    │
│  ┌───────────────────────┼──────────────┼───────────────────────────────────┐│
│  │                   Express.js Backend                                     ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │                    Authentication Middleware                        │││
│  │  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐    │││
│  │  │   │ JWT Verify  │  │ API Key     │  │ Permission Checker      │    │││
│  │  │   │             │  │ Validation  │  │ (RBAC)                  │    │││
│  │  │   └─────────────┘  └─────────────┘  └─────────────────────────┘    │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  │                                                                         ││
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ ││
│  │  │ Admin Routes    │  │ Tenant Routes   │  │ Public API Routes       │ ││
│  │  │ /api/admin/*    │  │ /api/tenant/*   │  │ /api/v1/*               │ ││
│  │  └────────┬────────┘  └────────┬────────┘  └───────────┬─────────────┘ ││
│  │           │                    │                        │               ││
│  │  ┌────────┴────────────────────┴────────────────────────┴─────────────┐││
│  │  │                    Service Layer                                   │││
│  │  │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │││
│  │  │   │ Client   │  │ User     │  │ Device   │  │ Analytics        │  │││
│  │  │   │ Service  │  │ Service  │  │ Service  │  │ Service          │  │││
│  │  │   └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │││
│  │  └────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                        │                                     │
│  ┌─────────────────────────────────────┼───────────────────────────────────┐│
│  │                    Supabase PostgreSQL                                  ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐││
│  │  │  clients    │  │tenant_users │  │ client_tags │  │   audit_logs    │││
│  │  │  api_keys   │  │ permissions │  │ sensor_data │  │  usage_daily    │││
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────┘││
│  │                                                                         ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐││
│  │  │                 Row Level Security (RLS) Policies                   │││
│  │  └─────────────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Authentication Architecture

```
┌───────────┐     ┌───────────┐     ┌────────────────┐     ┌───────────────┐
│  Request  │────▶│  Extract  │────▶│  Validate      │────▶│  Attach to    │
│           │     │  Token    │     │  JWT/API Key   │     │  req.user     │
└───────────┘     └───────────┘     └────────────────┘     └───────────────┘
                                            │
                        ┌───────────────────┼───────────────────┐
                        │                   │                   │
                        ▼                   ▼                   ▼
                 ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                 │ Super Admin │     │ Tenant User │     │ API Key     │
                 │ Full Access │     │ Scoped      │     │ Limited     │
                 └─────────────┘     └─────────────┘     └─────────────┘
```

### Middleware Stack

```javascript
// Middleware order
app.use(cors());
app.use(express.json());
app.use(requestLogger);           // Log all requests
app.use(extractAuth);             // Extract JWT or API Key
app.use('/api/admin', requireSuperAdmin);  // Super admin only
app.use('/api/tenant', requireTenantAuth); // Tenant users
app.use('/api/v1', requireApiKey);          // Public API
```

### File Structure (New/Modified)

```
api/
├── admin/
│   ├── clients/
│   │   ├── list.js          # GET /api/admin/clients
│   │   ├── create.js        # POST /api/admin/clients
│   │   ├── get.js           # GET /api/admin/clients/:id
│   │   ├── update.js        # PUT /api/admin/clients/:id
│   │   └── delete.js        # DELETE /api/admin/clients/:id
│   ├── users/
│   │   ├── list.js          # GET /api/admin/clients/:id/users
│   │   ├── create.js        # POST /api/admin/clients/:id/users
│   │   ├── update.js        # PUT /api/admin/clients/:id/users/:userId
│   │   └── delete.js        # DELETE /api/admin/clients/:id/users/:userId
│   ├── analytics/
│   │   ├── overview.js      # GET /api/admin/analytics/overview
│   │   └── tenants.js       # GET /api/admin/analytics/tenants
│   └── audit-logs.js        # GET /api/admin/audit-logs
│
├── tenant/
│   ├── auth/
│   │   ├── login.js         # POST /api/tenant/auth/login
│   │   └── me.js            # GET /api/tenant/auth/me
│   ├── users/
│   │   ├── list.js          # GET /api/tenant/users
│   │   ├── create.js        # POST /api/tenant/users
│   │   └── ...
│   ├── devices/
│   │   ├── list.js          # GET /api/tenant/devices
│   │   ├── bind.js          # POST /api/tenant/devices
│   │   └── unbind.js        # DELETE /api/tenant/devices/:mac
│   ├── api-keys/
│   │   ├── list.js
│   │   ├── create.js
│   │   └── revoke.js
│   └── usage.js             # GET /api/tenant/usage
│
lib/
├── auth.js                  # Enhanced with tenant auth
├── permissions.js           # RBAC permission checking
├── audit.js                 # Audit logging utility
└── supabase.js              # Existing

middleware/
├── extractAuth.js           # Extract JWT/API Key
├── requireSuperAdmin.js     # Super admin gate
├── requireTenantAuth.js     # Tenant user gate
├── requirePermission.js     # RBAC permission check
└── tenantScope.js           # Ensure client_id filter
```

---

## 11. Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Definition | Target | Measurement |
|--------|------------|--------|-------------|
| **Active Tenants** | Tenants with activity in last 30d | 20+ | Database query |
| **Avg Users per Tenant** | total_users / total_tenants | 5+ | Database query |
| **API Usage per Tenant** | Monthly API calls per tenant | 10,000+ avg | usage_daily table |
| **Tenant Retention Rate** | Tenants active after 90d | 85%+ | Cohort analysis |
| **Self-service Rate** | Tenant admin actions / total actions | 90%+ | Audit logs |

### Operational Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Tenant onboarding time | <30 minutes | >2 hours |
| Support tickets (tenant mgmt) | -80% from baseline | Increase |
| API response time (admin) | <200ms p95 | >500ms |
| Authentication failures | <1% | >5% |
| Audit log completeness | 100% | <99% |

### Business Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| New tenants per month | 5+ | Monthly |
| Tenant upgrades (tier) | 2+ per month | Monthly |
| Revenue per tenant | Based on tier | Monthly |
| Tenant lifetime value | 12+ months avg | Quarterly |

### Dashboard Widgets

1. **Tenant Health Score** (composite metric)
   - Active users: 25%
   - Device activity: 25%
   - API usage: 25%
   - Recent login: 25%

2. **Growth Metrics**
   - Tenant count trend
   - User count trend
   - Device count trend

3. **Usage Distribution**
   - By tier
   - By region (future)
   - By industry (future)

---

## 12. Out of Scope

The following items are explicitly excluded from Phase 3:

| Item | Reason | Future Phase |
|------|--------|--------------|
| Billing/Payment Processing | Requires payment provider integration | Phase 4 |
| Custom Domain per Tenant | DNS and SSL complexity | Phase 5 |
| SSO Integration (SAML/OAuth) | Enterprise feature, high complexity | Phase 5 |
| White-label Branding | Requires asset management | Phase 4 |
| Mobile Admin App | Native app development scope | Phase 6+ |
| Multi-region Deployment | Infrastructure complexity | Phase 6+ |
| Custom Roles | Fixed roles sufficient for MVP | Phase 4 |
| Data Export (Full Tenant) | GDPR compliance scope | Phase 4 |
| Tenant Deletion (GDPR) | Legal review required | Phase 4 |
| Reseller/Partner Portal | Different user journey | Phase 5+ |

---

## 13. Timeline & Milestones

### Phase 3a: MVP (5 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 1 | Database & Auth Foundation | Schema migration, tenant_users table, JWT updates |
| 2 | Client Management API/UI | Full CRUD for clients in admin dashboard |
| 3 | User Management | Tenant user CRUD, invitation flow |
| 4 | Device & API Key UI | Binding UI, key management per tenant |
| 5 | Usage Dashboard & Polish | Basic analytics, testing, bug fixes |

### Phase 3b: Enhanced Features (3 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 6 | RBAC Implementation | Permission system, role enforcement |
| 7 | Audit Logging | Full audit trail, log viewer |
| 8 | Advanced Analytics | Cross-tenant views, exports |

### Phase 3c: Nice to Have (2 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 9 | Bulk Operations | CSV import, bulk device binding |
| 10 | Quota Management UI | Visual quota settings, alerts |

### Key Dates

| Date | Event |
|------|-------|
| 2026-03-25 | Phase 3a kickoff |
| 2026-04-29 | Phase 3a MVP release |
| 2026-05-20 | Phase 3b release |
| 2026-06-03 | Phase 3c release |
| 2026-06-10 | Phase 3 complete, retrospective |

### Dependencies on Previous Phases

| Dependency | Phase | Status |
|------------|-------|--------|
| Real-time Chat | Phase 1 | Completed |
| Report Scheduling | Phase 2 | Completed |
| Base client/api_keys tables | Existing | Ready |
| Admin authentication | Existing | Ready |

---

## 14. Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|------------|-------|--------|-------------------|
| Supabase RLS setup | DevOps | Pending | Critical - data isolation |
| Email service (invitations) | DevOps | Ready (Resend) | Medium - invite flow |
| JWT library update | Backend | Pending | Medium - tenant auth |
| Frontend routing | Frontend | Ready | Low |

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| RLS performance impact | Medium | High | Test with 100+ tenants, optimize queries |
| Permission bugs | Medium | Critical | Comprehensive test suite, security review |
| Migration breaks existing data | Low | Critical | Staged rollout, backup strategy |
| User adoption low | Medium | Medium | Onboarding guide, in-app tutorials |
| Scope creep | High | Medium | Strict PRD adherence, change control |

### Security Considerations

1. **Data Isolation Testing**
   - Automated tests verify tenant A cannot access tenant B data
   - Penetration testing before production

2. **Authentication Security**
   - JWT tokens include client_id claim
   - Token refresh mechanism
   - Session timeout (24h)

3. **Audit Compliance**
   - All actions logged with actor, target, timestamp
   - Logs immutable (append-only)
   - Retention: 2 years

### Rollback Plan

1. **Database:** Schema changes are additive; can coexist with old code
2. **API:** Version endpoints; old clients continue working
3. **UI:** Feature flags to disable new sections
4. **Full Rollback:** Documented procedure, tested monthly

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| Tenant | A client organization using the UTtag platform |
| Super Admin | System administrator with full platform access |
| Tenant Admin | Administrator within a specific tenant organization |
| RBAC | Role-Based Access Control |
| RLS | Row Level Security (PostgreSQL feature) |
| SaaS | Software as a Service |
| B2B | Business to Business |

### B. Related Documents

- Phase 1 PRD: Real-time Chat (Completed)
- Phase 2 PRD: Report Scheduling (Completed)
- UTtag Technical Architecture Document
- Supabase Schema Reference (`supabase-schema.sql`)
- API Authentication Guide (`lib/auth.js`)

### C. UI Mockups Reference

All UI mockups in this document are ASCII representations. High-fidelity designs to be created in Figma during implementation.

### D. API Error Codes

| Code | Message | Description |
|------|---------|-------------|
| 401 | Unauthorized | Missing or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | Duplicate resource (e.g., email) |
| 422 | Validation Error | Invalid input data |
| 429 | Rate Limited | Too many requests |

### E. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-18 | PM Agent | Initial draft |

### F. Stakeholder Approval

| Role | Name | Approval | Date |
|------|------|----------|------|
| Product Owner | | [ ] Pending | |
| Tech Lead | | [ ] Pending | |
| QA Lead | | [ ] Pending | |
| Security Lead | | [ ] Pending | |
| Design Lead | | [ ] Pending | |

---

*This document is subject to change based on stakeholder feedback and technical discovery.*
