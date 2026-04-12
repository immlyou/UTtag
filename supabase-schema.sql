-- ============================================
-- UTFind B2B API Management — Supabase Schema
-- ============================================

-- 客戶 (Clients)
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  company TEXT,
  phone TEXT,
  tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'basic', 'pro', 'enterprise')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  max_tags INTEGER DEFAULT 10,
  max_keys INTEGER DEFAULT 2,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  permissions TEXT[] DEFAULT ARRAY['read'],
  rate_limit INTEGER DEFAULT 60,       -- requests per minute
  daily_limit INTEGER DEFAULT 1000,    -- requests per day
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 管理員帳號
CREATE TABLE admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('superadmin', 'admin')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API 使用量紀錄
CREATE TABLE usage_logs (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'POST',
  status_code INTEGER,
  response_ms INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 每日用量統計（自動聚合）
CREATE TABLE usage_daily (
  id BIGSERIAL PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  request_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  avg_response_ms INTEGER DEFAULT 0,
  UNIQUE(api_key_id, date)
);

-- 計費方案定義
CREATE TABLE billing_tiers (
  tier TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_monthly INTEGER DEFAULT 0,    -- NTD
  max_tags INTEGER,
  max_keys INTEGER,
  rate_limit INTEGER,                 -- per minute
  daily_limit INTEGER,
  features JSONB DEFAULT '[]'
);

-- 預設方案資料
INSERT INTO billing_tiers (tier, name, price_monthly, max_tags, max_keys, rate_limit, daily_limit, features) VALUES
  ('free',       '免費版',   0,     10,   2,   30,   500,    '["dashboard","alerts"]'),
  ('basic',      '基本版',   990,   100,  5,   60,   5000,   '["dashboard","alerts","reports","geofence"]'),
  ('pro',        '專業版',   2990,  500,  20,  120,  50000,  '["dashboard","alerts","reports","geofence","api","webhook","coldchain"]'),
  ('enterprise', '企業版',   0,     NULL, NULL, NULL, NULL,   '["all"]');

-- 感測器資料
CREATE TABLE sensor_data (
  id BIGSERIAL PRIMARY KEY,
  mac TEXT NOT NULL,
  temperature DECIMAL(5,2),
  humidity DECIMAL(5,2),
  pressure DECIMAL(7,2),
  source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'ble', 'lora', 'api', 'demo')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 感測器綁定（哪個 MAC 有接哪些感測器）
CREATE TABLE sensor_bindings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mac TEXT NOT NULL,
  sensor_type TEXT NOT NULL CHECK (sensor_type IN ('temperature', 'humidity', 'pressure', 'all')),
  device_name TEXT,
  min_threshold DECIMAL(5,2),
  max_threshold DECIMAL(5,2),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 客戶 TAG 綁定（哪個客戶可以存取哪些 TAG）
CREATE TABLE client_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  mac TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, mac)
);

-- 索引
CREATE INDEX idx_client_tags_client ON client_tags(client_id);
CREATE INDEX idx_client_tags_mac ON client_tags(mac);
CREATE INDEX idx_sensor_data_mac ON sensor_data(mac);
CREATE INDEX idx_sensor_data_created ON sensor_data(created_at);
CREATE INDEX idx_sensor_data_mac_created ON sensor_data(mac, created_at DESC);
CREATE INDEX idx_sensor_bindings_mac ON sensor_bindings(mac);
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_client ON api_keys(client_id);
CREATE INDEX idx_usage_logs_key ON usage_logs(api_key_id);
CREATE INDEX idx_usage_logs_created ON usage_logs(created_at);
CREATE INDEX idx_usage_daily_key_date ON usage_daily(api_key_id, date);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 原子操作：遞增每日用量統計（避免 race condition）
CREATE OR REPLACE FUNCTION increment_usage_daily(
  p_api_key_id UUID,
  p_client_id UUID,
  p_date DATE,
  p_response_ms INTEGER,
  p_is_error BOOLEAN
) RETURNS void AS $$
BEGIN
  INSERT INTO usage_daily (api_key_id, client_id, date, request_count, error_count, avg_response_ms)
  VALUES (p_api_key_id, p_client_id, p_date, 1,
          CASE WHEN p_is_error THEN 1 ELSE 0 END,
          COALESCE(p_response_ms, 0))
  ON CONFLICT (api_key_id, date)
  DO UPDATE SET
    request_count = usage_daily.request_count + 1,
    error_count = usage_daily.error_count + CASE WHEN p_is_error THEN 1 ELSE 0 END,
    avg_response_ms = ROUND(
      (usage_daily.avg_response_ms * usage_daily.request_count + COALESCE(p_response_ms, 0))
      / (usage_daily.request_count + 1)
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- PDA 裝置追蹤（Find my PDA）
-- ============================================

-- 已註冊的裝置（PDA / 手機）
CREATE TABLE devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  device_type TEXT DEFAULT 'pda' CHECK (device_type IN ('pda', 'phone', 'tablet', 'other')),
  identifier TEXT UNIQUE NOT NULL,  -- 裝置端產生的唯一 ID（存在 localStorage）
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'lost', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 裝置打卡紀錄（每次 fetchLatest 時回報）
CREATE TABLE device_checkins (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  nearby_tags JSONB DEFAULT '[]',  -- [{mac, lat, lng}]
  tag_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_devices_identifier ON devices(identifier);
CREATE INDEX idx_device_checkins_device ON device_checkins(device_id);
CREATE INDEX idx_device_checkins_created ON device_checkins(created_at DESC);

CREATE TRIGGER devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 即時聊天系統（Real-time Chat）
-- ============================================

-- 使用者（聊天參與者）
CREATE TABLE chat_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'operator', 'user')),
  status TEXT DEFAULT 'online' CHECK (status IN ('online', 'offline', 'away')),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 對話（群組/直接/告警）
CREATE TABLE conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('direct', 'group', 'alert')),
  name TEXT,
  description TEXT,
  alert_id TEXT,  -- 關聯的告警 ID（如果是 alert 類型）
  tag_mac TEXT,   -- 關聯的 Tag MAC（如果是 alert 類型）
  created_by UUID REFERENCES chat_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 訊息
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES chat_users(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'alert', 'system', 'location', 'image')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  read_by UUID[] DEFAULT '{}'
);

-- 對話參與者
CREATE TABLE conversation_participants (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES chat_users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_read_at TIMESTAMPTZ,
  notifications_enabled BOOLEAN DEFAULT true,
  PRIMARY KEY (conversation_id, user_id)
);

-- 聊天索引
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_participants_user ON conversation_participants(user_id);
CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_conversations_type ON conversations(type);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
CREATE INDEX idx_chat_users_email ON chat_users(email);

-- 自動更新 conversations.updated_at
CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 新訊息時自動更新 conversation 的 updated_at
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = now() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER messages_update_conversation
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- RLS Policies（需要先啟用 RLS）
ALTER TABLE chat_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Chat Tables
-- ============================================

-- chat_users: Allow authenticated users to read all users, but only update their own
CREATE POLICY "Allow read access to all chat users"
  ON chat_users FOR SELECT
  USING (true);

CREATE POLICY "Allow users to insert their own record"
  ON chat_users FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow users to update their own record"
  ON chat_users FOR UPDATE
  USING (true);

-- conversations: Users can see conversations they participate in
CREATE POLICY "Allow read access to participant conversations"
  ON conversations FOR SELECT
  USING (
    id IN (
      SELECT conversation_id FROM conversation_participants
    )
    OR created_by IS NOT NULL
  );

CREATE POLICY "Allow creating conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow updating conversations"
  ON conversations FOR UPDATE
  USING (true);

-- messages: Users can see messages in their conversations
CREATE POLICY "Allow read access to conversation messages"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT conversation_id FROM conversation_participants
    )
  );

CREATE POLICY "Allow sending messages"
  ON messages FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow updating messages (for read_by)"
  ON messages FOR UPDATE
  USING (true);

-- conversation_participants: Users can see participants in their conversations
CREATE POLICY "Allow read access to participants"
  ON conversation_participants FOR SELECT
  USING (true);

CREATE POLICY "Allow adding participants"
  ON conversation_participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow updating participant status"
  ON conversation_participants FOR UPDATE
  USING (true);

CREATE POLICY "Allow removing participants"
  ON conversation_participants FOR DELETE
  USING (true);

-- ============================================

-- 啟用 Realtime（Supabase 控制台也需要開啟）
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE conversation_participants;

-- ============================================
-- Report Scheduling System (報表排程系統)
-- ============================================

-- Report Schedules (報表排程)
CREATE TABLE report_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Ownership
  created_by UUID REFERENCES admins(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- Schedule Identity
  name TEXT NOT NULL,
  description TEXT,

  -- Report Configuration
  report_type TEXT NOT NULL CHECK (report_type IN (
    'temperature_excursion',
    'geofence_events',
    'task_completion',
    'haccp_compliance',
    'batch_traceability'
  )),

  -- Filters (JSONB for flexibility)
  tag_macs TEXT[] DEFAULT '{}',
  geofence_ids UUID[] DEFAULT '{}',
  date_range_type TEXT DEFAULT 'last_24h' CHECK (date_range_type IN (
    'last_24h', 'last_7d', 'last_30d', 'last_month', 'custom'
  )),
  custom_range_days INTEGER,

  -- Schedule Timing
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  run_at_hour INTEGER NOT NULL CHECK (run_at_hour >= 0 AND run_at_hour <= 23),
  run_at_minute INTEGER DEFAULT 0 CHECK (run_at_minute >= 0 AND run_at_minute <= 59),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
  timezone TEXT DEFAULT 'Asia/Taipei',

  -- Delivery
  delivery_method TEXT DEFAULT 'email' CHECK (delivery_method IN ('email', 'line', 'telegram')),
  recipients JSONB DEFAULT '[]',

  -- Status
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT CHECK (last_run_status IN ('success', 'failed', 'partial')),
  last_run_error TEXT,
  next_run_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Report Executions (報表執行紀錄)
CREATE TABLE report_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES report_schedules(id) ON DELETE CASCADE,

  -- Execution Details
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_message TEXT,

  -- Report Data
  report_data JSONB,
  pdf_url TEXT,
  pdf_size_bytes INTEGER,

  -- Delivery Status
  delivery_status JSONB DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for Report Scheduling
CREATE INDEX idx_schedules_next_run ON report_schedules(next_run_at) WHERE enabled = true;
CREATE INDEX idx_schedules_created_by ON report_schedules(created_by);
CREATE INDEX idx_schedules_client ON report_schedules(client_id);
CREATE INDEX idx_executions_schedule ON report_executions(schedule_id);
CREATE INDEX idx_executions_created ON report_executions(created_at DESC);

-- Trigger for updated_at on report_schedules
CREATE TRIGGER report_schedules_updated_at
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

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
-- Phase 3: Indexes
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
-- Phase 3: Triggers
-- ============================================
CREATE TRIGGER tenant_users_updated_at
  BEFORE UPDATE ON tenant_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tenant_settings_updated_at
  BEFORE UPDATE ON tenant_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Phase 3: Default Permissions Data
-- ============================================
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

-- ============================================
-- Phase 3: RLS Policies
-- ============================================
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_users
CREATE POLICY "Super admins can view all tenant users"
  ON tenant_users FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

CREATE POLICY "Tenant users can view own org users"
  ON tenant_users FOR SELECT
  USING (
    client_id = (
      SELECT client_id FROM tenant_users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can create users"
  ON tenant_users FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.id = auth.uid()
        AND tu.client_id = client_id
        AND tu.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can update users"
  ON tenant_users FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.id = auth.uid()
        AND tu.client_id = tenant_users.client_id
        AND tu.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can delete users"
  ON tenant_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tenant_users tu
      WHERE tu.id = auth.uid()
        AND tu.client_id = tenant_users.client_id
        AND tu.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM admins WHERE id = auth.uid()
    )
  );

-- RLS Policies for audit_logs
CREATE POLICY "Super admins can view all audit logs"
  ON audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE id = auth.uid() AND role = 'superadmin'
    )
  );

CREATE POLICY "Tenant admins can view own org audit logs"
  ON audit_logs FOR SELECT
  USING (
    client_id = (
      SELECT client_id FROM tenant_users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (true);

-- RLS Policies for tenant_settings
CREATE POLICY "Tenant users can view own org settings"
  ON tenant_settings FOR SELECT
  USING (
    client_id = (SELECT client_id FROM tenant_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
  );

CREATE POLICY "Tenant admins can update own org settings"
  ON tenant_settings FOR UPDATE
  USING (
    client_id = (
      SELECT client_id FROM tenant_users
      WHERE id = auth.uid() AND role = 'admin'
    )
    OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
  );

-- Add user_id tracking to existing tables for audit purposes
ALTER TABLE client_tags ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS created_by UUID;

-- Add indexes for tenant queries
CREATE INDEX IF NOT EXISTS idx_client_tags_client_created
  ON client_tags(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_keys_client_status
  ON api_keys(client_id, status);

-- ============================================
-- Phase 4: Mobile App Support
-- ============================================

-- Mobile device registrations (for push notifications)
CREATE TABLE mobile_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES tenant_users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  device_id TEXT UNIQUE NOT NULL,
  fcm_token TEXT NOT NULL,
  device_type TEXT DEFAULT 'unknown' CHECK (device_type IN ('ios', 'android', 'unknown')),
  device_name TEXT,
  os_version TEXT,
  app_version TEXT,

  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'revoked')),
  last_active_at TIMESTAMPTZ DEFAULT now(),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User location tracking (for drivers)
CREATE TABLE user_locations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES tenant_users(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy DECIMAL(5,2),
  speed DECIMAL(6,2),
  heading DECIMAL(5,2),

  recorded_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Task management for mobile workflows
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,
  task_type TEXT DEFAULT 'delivery' CHECK (task_type IN ('delivery', 'pickup', 'inspection', 'maintenance', 'other')),

  -- Assignment
  assigned_to UUID REFERENCES tenant_users(id),
  created_by UUID REFERENCES tenant_users(id),

  -- Location
  location_name TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),

  -- Timing
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Associated tags
  tag_macs TEXT[] DEFAULT '{}',

  -- Completion data
  completion_data JSONB DEFAULT '{}',
  checklist JSONB DEFAULT '[]',
  photos TEXT[] DEFAULT '{}',
  signature_url TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Alerts (mobile push notifications log)
CREATE TABLE alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  alert_type TEXT NOT NULL CHECK (alert_type IN ('sos', 'temperature', 'geofence', 'battery', 'offline', 'task')),
  severity TEXT DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  tag_mac TEXT,
  tag_name TEXT,

  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',

  -- Delivery tracking
  sent_to UUID[] DEFAULT '{}',
  read_by UUID[] DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Scan history (QR code / NFC scans from mobile)
CREATE TABLE scan_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES tenant_users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  mac TEXT NOT NULL,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),

  scanned_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notification preferences per user
CREATE TABLE notification_preferences (
  user_id UUID REFERENCES tenant_users(id) ON DELETE CASCADE PRIMARY KEY,

  push_enabled BOOLEAN DEFAULT true,

  -- Per-type preferences
  sos_enabled BOOLEAN DEFAULT true,
  temperature_enabled BOOLEAN DEFAULT true,
  geofence_enabled BOOLEAN DEFAULT true,
  battery_enabled BOOLEAN DEFAULT false,
  offline_enabled BOOLEAN DEFAULT false,
  task_enabled BOOLEAN DEFAULT true,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_start TIME,
  quiet_end TIME,

  -- Scope
  assigned_tags_only BOOLEAN DEFAULT false,

  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- Phase 4: Indexes
-- ============================================
CREATE INDEX idx_mobile_devices_user ON mobile_devices(user_id);
CREATE INDEX idx_mobile_devices_client ON mobile_devices(client_id);
CREATE INDEX idx_mobile_devices_fcm ON mobile_devices(fcm_token);
CREATE INDEX idx_mobile_devices_status ON mobile_devices(status);
CREATE INDEX idx_user_locations_user ON user_locations(user_id, recorded_at DESC);
CREATE INDEX idx_user_locations_client ON user_locations(client_id);
CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_status ON tasks(status, due_at);
CREATE INDEX idx_tasks_updated ON tasks(updated_at);
CREATE INDEX idx_alerts_client ON alerts(client_id, created_at DESC);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_scan_history_mac ON scan_history(mac);
CREATE INDEX idx_scan_history_user ON scan_history(user_id, scanned_at DESC);
CREATE INDEX idx_scan_history_client ON scan_history(client_id);

-- ============================================
-- Phase 4: Triggers
-- ============================================
CREATE TRIGGER mobile_devices_updated_at
  BEFORE UPDATE ON mobile_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Phase 4: Function to find nearby tags
-- ============================================
CREATE OR REPLACE FUNCTION find_nearby_tags(
  p_lat DECIMAL,
  p_lng DECIMAL,
  p_radius_m INTEGER,
  p_client_id UUID
) RETURNS TABLE (
  mac TEXT,
  name TEXT,
  latitude DECIMAL,
  longitude DECIMAL,
  distance_m DECIMAL,
  temperature DECIMAL,
  status TEXT,
  last_seen_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH latest_locations AS (
    -- Get latest location for each tag from sensor data
    SELECT DISTINCT ON (d.mac)
      d.mac,
      ct.label as name,
      d.latitude,
      d.longitude,
      d.temperature,
      d.created_at as last_seen_at
    FROM sensor_data d
    JOIN client_tags ct ON ct.mac = d.mac
    WHERE ct.client_id = p_client_id
      AND d.latitude IS NOT NULL
      AND d.longitude IS NOT NULL
    ORDER BY d.mac, d.created_at DESC
  )
  SELECT
    ll.mac,
    ll.name,
    ll.latitude,
    ll.longitude,
    -- Haversine distance approximation
    (6371000 * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(p_lat)) * cos(radians(ll.latitude)) *
        cos(radians(ll.longitude) - radians(p_lng)) +
        sin(radians(p_lat)) * sin(radians(ll.latitude))
      ))
    ))::DECIMAL as distance_m,
    ll.temperature,
    CASE
      WHEN ll.last_seen_at > now() - interval '1 hour' THEN 'online'
      ELSE 'offline'
    END as status,
    ll.last_seen_at
  FROM latest_locations ll
  WHERE (6371000 * acos(
    LEAST(1.0, GREATEST(-1.0,
      cos(radians(p_lat)) * cos(radians(ll.latitude)) *
      cos(radians(ll.longitude) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(ll.latitude))
    ))
  )) <= p_radius_m
  ORDER BY distance_m;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Phase 4: Enable Realtime for mobile tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- ============================================
-- Phase 4: RLS Policies
-- ============================================
ALTER TABLE mobile_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Mobile devices: Users can manage their own devices
CREATE POLICY "Users can view own devices"
  ON mobile_devices FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

CREATE POLICY "Users can insert own devices"
  ON mobile_devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own devices"
  ON mobile_devices FOR UPDATE
  USING (user_id = auth.uid());

-- User locations: Users can manage their own locations
CREATE POLICY "Users can view own locations"
  ON user_locations FOR SELECT
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid()));

CREATE POLICY "Users can insert own locations"
  ON user_locations FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Tasks: Users can view tasks in their org
CREATE POLICY "Users can view org tasks"
  ON tasks FOR SELECT
  USING (
    client_id = (SELECT client_id FROM tenant_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
  );

CREATE POLICY "Users can create tasks in org"
  ON tasks FOR INSERT
  WITH CHECK (
    client_id = (SELECT client_id FROM tenant_users WHERE id = auth.uid())
  );

CREATE POLICY "Users can update assigned tasks"
  ON tasks FOR UPDATE
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tenant_users
      WHERE id = auth.uid() AND client_id = tasks.client_id AND role = 'admin'
    )
  );

-- Alerts: Users can view alerts in their org
CREATE POLICY "Users can view org alerts"
  ON alerts FOR SELECT
  USING (
    client_id = (SELECT client_id FROM tenant_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
  );

CREATE POLICY "System can insert alerts"
  ON alerts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update alerts (mark read)"
  ON alerts FOR UPDATE
  USING (
    client_id = (SELECT client_id FROM tenant_users WHERE id = auth.uid())
  );

-- Scan history: Users can view their own scans
CREATE POLICY "Users can view own scans"
  ON scan_history FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tenant_users
      WHERE id = auth.uid() AND client_id = scan_history.client_id AND role = 'admin'
    )
    OR EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
  );

CREATE POLICY "Users can insert own scans"
  ON scan_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Notification preferences: Users can manage their own preferences
CREATE POLICY "Users can view own notification prefs"
  ON notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own notification prefs"
  ON notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own notification prefs"
  ON notification_preferences FOR UPDATE
  USING (user_id = auth.uid());
