# System Design Document (SDD)
# Phase 4: Mobile App Technical Specification

**Document Version:** 1.0
**Last Updated:** 2026-03-18
**Author:** SA Agent (System Analyst)
**Status:** Draft
**Project:** UTtag - IoT Cold Chain Tracking Mobile App

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [API Design](#2-api-design)
3. [Push Notification System](#3-push-notification-system)
4. [Offline Mode Architecture](#4-offline-mode-architecture)
5. [Screen Specifications](#5-screen-specifications)
6. [QR Code Scanner](#6-qr-code-scanner)
7. [Integration Diagram](#7-integration-diagram)
8. [Security](#8-security)
9. [Build & Deploy](#9-build--deploy)

---

## 1. Architecture Overview

### 1.1 React Native Architecture

The mobile app follows a layered architecture pattern with clear separation of concerns.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Presentation Layer                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Screens   │  │ Components  │  │  Navigation │  │    Theme        │ │
│  │  (Views)    │  │ (Reusable)  │  │  (Router)   │  │  (Styles)       │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────────────────┘ │
│         │                │                │                              │
│         └────────────────┼────────────────┘                              │
│                          │                                               │
├──────────────────────────┼───────────────────────────────────────────────┤
│                     State Layer                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │                      Zustand Stores                                 │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │ │
│  │  │authStore │ │ tagStore │ │taskStore │ │alertStore│ │settingsS │  │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                          │                                               │
├──────────────────────────┼───────────────────────────────────────────────┤
│                     Data Layer                                           │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────┐ │
│  │   API Service     │  │   WatermelonDB    │  │   Secure Storage      │ │
│  │  (Axios + RQ)     │  │   (Offline DB)    │  │  (Keychain/Keystore)  │ │
│  └───────────────────┘  └───────────────────┘  └───────────────────────┘ │
│                          │                                               │
├──────────────────────────┼───────────────────────────────────────────────┤
│                   Native Layer                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐ │
│  │  Camera  │ │   GPS    │ │   FCM    │ │ Biometric│ │   Background   │ │
│  │  (QR)    │ │ Location │ │  (Push)  │ │  Auth    │ │   Tasks        │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 State Management (Zustand)

Zustand is selected over Redux Toolkit for its simplicity, minimal boilerplate, and excellent TypeScript support.

**Store Structure:**

```typescript
// stores/authStore.ts
interface AuthState {
  token: string | null;
  user: TenantUser | null;
  permissions: string[];
  isAuthenticated: boolean;
  isLoading: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkBiometric: () => Promise<boolean>;
}

// stores/tagStore.ts
interface TagState {
  tags: Tag[];
  selectedTag: Tag | null;
  filters: TagFilters;
  isLoading: boolean;
  lastSyncAt: Date | null;

  // Actions
  fetchTags: () => Promise<void>;
  selectTag: (mac: string) => void;
  setFilters: (filters: TagFilters) => void;
  syncOfflineTags: () => Promise<void>;
}

// stores/taskStore.ts
interface TaskState {
  tasks: Task[];
  pendingSync: Task[];
  selectedTask: Task | null;

  // Actions
  fetchTasks: () => Promise<void>;
  completeTask: (taskId: string, data: TaskCompletion) => Promise<void>;
  createTask: (task: CreateTaskDto) => Promise<void>;
  syncPendingTasks: () => Promise<void>;
}

// stores/alertStore.ts
interface AlertState {
  alerts: Alert[];
  unreadCount: number;

  // Actions
  fetchAlerts: () => Promise<void>;
  markAsRead: (alertId: string) => void;
  clearAll: () => void;
}

// stores/settingsStore.ts
interface SettingsState {
  theme: 'light' | 'dark' | 'system';
  language: 'zh-TW' | 'en';
  notifications: NotificationPreferences;
  offlineMode: boolean;

  // Actions
  setTheme: (theme: string) => void;
  updateNotificationPrefs: (prefs: NotificationPreferences) => void;
}
```

### 1.3 Navigation Structure

Using React Navigation 6.x with a combination of Stack and Tab navigators.

```
Root Navigator (Stack)
├── AuthStack (when not authenticated)
│   ├── LoginScreen
│   ├── ForgotPasswordScreen
│   └── BiometricSetupScreen
│
└── MainStack (when authenticated)
    ├── MainTabs (Bottom Tab Navigator)
    │   ├── MapTab
    │   │   └── MapStack
    │   │       ├── MapScreen
    │   │       └── TagDetailScreen
    │   │
    │   ├── TagsTab
    │   │   └── TagsStack
    │   │       ├── TagListScreen
    │   │       ├── TagDetailScreen
    │   │       └── TagHistoryScreen
    │   │
    │   ├── ScanTab (FAB-style center button)
    │   │   └── ScanStack
    │   │       ├── ScanScreen
    │   │       └── BatchScanScreen
    │   │
    │   ├── TasksTab
    │   │   └── TasksStack
    │   │       ├── TaskListScreen
    │   │       ├── TaskDetailScreen
    │   │       └── TaskCompletionScreen
    │   │
    │   └── ProfileTab
    │       └── ProfileStack
    │           ├── ProfileScreen
    │           ├── SettingsScreen
    │           ├── NotificationSettingsScreen
    │           └── AlertHistoryScreen
    │
    └── Modal Screens (presented modally)
        ├── NavigationScreen
        ├── PhotoCaptureScreen
        ├── SignatureCaptureScreen
        └── FilterScreen
```

### 1.4 Folder Structure

```
mobile/
├── android/                    # Android native code
├── ios/                        # iOS native code
├── src/
│   ├── app/
│   │   ├── App.tsx            # App entry point
│   │   ├── Navigation.tsx     # Navigation configuration
│   │   └── AppProviders.tsx   # Context providers wrapper
│   │
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   ├── ForgotPasswordScreen.tsx
│   │   │   └── BiometricSetupScreen.tsx
│   │   ├── map/
│   │   │   ├── MapScreen.tsx
│   │   │   └── components/
│   │   │       ├── TagMarker.tsx
│   │   │       ├── TagCluster.tsx
│   │   │       └── MapControls.tsx
│   │   ├── tags/
│   │   │   ├── TagListScreen.tsx
│   │   │   ├── TagDetailScreen.tsx
│   │   │   ├── TagHistoryScreen.tsx
│   │   │   └── components/
│   │   │       ├── TagCard.tsx
│   │   │       ├── TemperatureChart.tsx
│   │   │       └── StatusBadge.tsx
│   │   ├── scan/
│   │   │   ├── ScanScreen.tsx
│   │   │   ├── BatchScanScreen.tsx
│   │   │   └── components/
│   │   │       ├── ScanOverlay.tsx
│   │   │       └── ScanResultCard.tsx
│   │   ├── tasks/
│   │   │   ├── TaskListScreen.tsx
│   │   │   ├── TaskDetailScreen.tsx
│   │   │   ├── TaskCompletionScreen.tsx
│   │   │   └── components/
│   │   │       ├── TaskCard.tsx
│   │   │       ├── ChecklistItem.tsx
│   │   │       └── SignatureCapture.tsx
│   │   └── profile/
│   │       ├── ProfileScreen.tsx
│   │       ├── SettingsScreen.tsx
│   │       ├── NotificationSettingsScreen.tsx
│   │       └── AlertHistoryScreen.tsx
│   │
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── EmptyState.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── OfflineBanner.tsx
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── TabBar.tsx
│   │   │   └── SafeAreaWrapper.tsx
│   │   └── feedback/
│   │       ├── Toast.tsx
│   │       ├── AlertDialog.tsx
│   │       └── HapticFeedback.tsx
│   │
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── tagStore.ts
│   │   ├── taskStore.ts
│   │   ├── alertStore.ts
│   │   ├── settingsStore.ts
│   │   └── syncStore.ts
│   │
│   ├── services/
│   │   ├── api/
│   │   │   ├── client.ts          # Axios instance with interceptors
│   │   │   ├── auth.api.ts
│   │   │   ├── tags.api.ts
│   │   │   ├── tasks.api.ts
│   │   │   ├── mobile.api.ts
│   │   │   └── types.ts
│   │   ├── push/
│   │   │   ├── fcmService.ts
│   │   │   ├── notificationHandler.ts
│   │   │   └── channels.ts
│   │   ├── location/
│   │   │   ├── locationService.ts
│   │   │   └── geofenceService.ts
│   │   ├── storage/
│   │   │   ├── secureStorage.ts
│   │   │   └── asyncStorage.ts
│   │   └── sync/
│   │       ├── syncService.ts
│   │       └── conflictResolver.ts
│   │
│   ├── database/
│   │   ├── schema.ts
│   │   ├── index.ts
│   │   ├── models/
│   │   │   ├── Tag.model.ts
│   │   │   ├── Task.model.ts
│   │   │   ├── Alert.model.ts
│   │   │   └── ScanHistory.model.ts
│   │   └── sync/
│   │       ├── pullChanges.ts
│   │       ├── pushChanges.ts
│   │       └── syncAdapter.ts
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useTags.ts
│   │   ├── useTasks.ts
│   │   ├── useLocation.ts
│   │   ├── useCamera.ts
│   │   ├── useSync.ts
│   │   ├── useNetworkStatus.ts
│   │   └── useBiometric.ts
│   │
│   ├── utils/
│   │   ├── date.ts
│   │   ├── format.ts
│   │   ├── validation.ts
│   │   ├── permissions.ts
│   │   ├── constants.ts
│   │   └── logger.ts
│   │
│   ├── theme/
│   │   ├── index.ts
│   │   ├── colors.ts
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   └── shadows.ts
│   │
│   ├── i18n/
│   │   ├── index.ts
│   │   ├── zh-TW.json
│   │   └── en.json
│   │
│   └── types/
│       ├── api.types.ts
│       ├── navigation.types.ts
│       ├── models.types.ts
│       └── index.ts
│
├── __tests__/
│   ├── screens/
│   ├── components/
│   ├── stores/
│   └── services/
│
├── e2e/                        # Detox E2E tests
│   ├── login.test.ts
│   ├── tagMap.test.ts
│   └── scan.test.ts
│
├── .env.example
├── app.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## 2. API Design

### 2.1 New Mobile Endpoints

The following new API endpoints are required to support mobile-specific functionality.

#### 2.1.1 POST /api/mobile/register-device

Register device for push notifications (FCM token).

**Request:**
```json
{
  "fcm_token": "dFj8K2x...(FCM device token)",
  "device_id": "unique-device-identifier",
  "device_type": "ios" | "android",
  "device_name": "iPhone 15 Pro",
  "os_version": "iOS 17.2",
  "app_version": "1.0.0"
}
```

**Response:**
```json
{
  "success": true,
  "device": {
    "id": "uuid",
    "registered_at": "2026-03-18T10:00:00Z"
  }
}
```

**Backend Implementation (server.js addition):**
```javascript
app.use("/api/mobile/devices", require("./api/mobile/devices"));
```

**Handler (api/mobile/devices.js):**
```javascript
const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { requireTenantAuth, logAudit, getClientIP } = require("../../lib/auth-middleware");
const { json, error } = require("../../lib/auth");

// POST /api/mobile/devices/register
router.post("/register", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { fcm_token, device_id, device_type, device_name, os_version, app_version } = req.body;

  if (!fcm_token || !device_id) {
    return error(res, "fcm_token and device_id required", 400, req);
  }

  try {
    // Upsert device registration
    const { data: device, error: dbError } = await supabase
      .from("mobile_devices")
      .upsert({
        user_id: user.id,
        client_id: user.client_id,
        device_id,
        fcm_token,
        device_type: device_type || "unknown",
        device_name,
        os_version,
        app_version,
        last_active_at: new Date().toISOString(),
        status: "active"
      }, { onConflict: "device_id" })
      .select()
      .single();

    if (dbError) throw dbError;

    await logAudit({
      actor_type: "tenant_user",
      actor_id: user.id,
      actor_email: user.email,
      client_id: user.client_id,
      action: "register_device",
      resource: "mobile_devices",
      new_values: { device_id, device_type },
      ip_address: getClientIP(req)
    });

    json(res, { success: true, device: { id: device.id, registered_at: device.created_at } }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
```

#### 2.1.2 PUT /api/mobile/update-location

Update driver/user location for tracking.

**Request:**
```json
{
  "latitude": 25.0478,
  "longitude": 121.5170,
  "accuracy": 10.5,
  "speed": 45.2,
  "heading": 180,
  "timestamp": "2026-03-18T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "nearby_tags": [
    {
      "mac": "AA:BB:CC:DD:EE:01",
      "name": "COLD-TRUCK-001",
      "distance_m": 150
    }
  ]
}
```

**Handler (api/mobile/location.js):**
```javascript
const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { requireTenantAuth } = require("../../lib/auth-middleware");
const { json, error } = require("../../lib/auth");

// PUT /api/mobile/location
router.put("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { latitude, longitude, accuracy, speed, heading, timestamp } = req.body;

  if (!latitude || !longitude) {
    return error(res, "latitude and longitude required", 400, req);
  }

  try {
    // Store user location
    await supabase.from("user_locations").insert({
      user_id: user.id,
      client_id: user.client_id,
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      recorded_at: timestamp || new Date().toISOString()
    });

    // Find nearby tags (within 500m) - simplified distance calculation
    const { data: nearbyTags } = await supabase.rpc("find_nearby_tags", {
      p_lat: latitude,
      p_lng: longitude,
      p_radius_m: 500,
      p_client_id: user.client_id
    });

    json(res, {
      success: true,
      nearby_tags: nearbyTags || []
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

module.exports = router;
```

#### 2.1.3 POST /api/mobile/sync

Offline data synchronization endpoint.

**Request:**
```json
{
  "last_sync_at": "2026-03-18T09:00:00Z",
  "pending_changes": {
    "tasks": [
      {
        "id": "local-uuid",
        "server_id": "server-uuid-if-exists",
        "action": "update",
        "data": {
          "status": "completed",
          "completed_at": "2026-03-18T10:00:00Z",
          "completion_data": { ... }
        }
      }
    ],
    "scans": [
      {
        "mac": "AA:BB:CC:DD:EE:01",
        "scanned_at": "2026-03-18T09:30:00Z",
        "latitude": 25.0478,
        "longitude": 121.5170
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "sync_timestamp": "2026-03-18T10:05:00Z",
  "changes": {
    "tags": {
      "created": [],
      "updated": [ { "mac": "...", "temperature": -2.3, ... } ],
      "deleted": []
    },
    "tasks": {
      "created": [ { "id": "...", "title": "...", ... } ],
      "updated": [],
      "deleted": []
    },
    "alerts": {
      "created": [ { "id": "...", "type": "temperature", ... } ],
      "updated": [],
      "deleted": []
    }
  },
  "conflicts": [
    {
      "entity": "task",
      "id": "uuid",
      "server_version": { ... },
      "client_version": { ... },
      "resolution": "server_wins" | "client_wins" | "manual"
    }
  ]
}
```

**Handler (api/mobile/sync.js):**
```javascript
const express = require("express");
const router = express.Router();
const { supabase } = require("../../lib/supabase");
const { requireTenantAuth } = require("../../lib/auth-middleware");
const { json, error } = require("../../lib/auth");

// POST /api/mobile/sync
router.post("/", async (req, res) => {
  const user = await requireTenantAuth(req, res);
  if (!user) return;

  const { last_sync_at, pending_changes } = req.body;
  const syncTimestamp = new Date().toISOString();
  const conflicts = [];

  try {
    // 1. Process pending changes from client
    if (pending_changes?.tasks?.length) {
      for (const change of pending_changes.tasks) {
        await processTaskChange(user, change, conflicts);
      }
    }

    if (pending_changes?.scans?.length) {
      await supabase.from("scan_history").insert(
        pending_changes.scans.map(scan => ({
          ...scan,
          user_id: user.id,
          client_id: user.client_id
        }))
      );
    }

    // 2. Fetch server changes since last sync
    const lastSync = last_sync_at || new Date(0).toISOString();

    // Get updated tags
    const { data: tags } = await supabase
      .from("client_tags")
      .select("mac, label, sensor_data:sensor_data(temperature, humidity, battery, created_at)")
      .eq("client_id", user.client_id)
      .gt("updated_at", lastSync);

    // Get updated tasks
    const { data: tasks } = await supabase
      .from("tasks")
      .select("*")
      .eq("client_id", user.client_id)
      .gt("updated_at", lastSync);

    // Get new alerts
    const { data: alerts } = await supabase
      .from("alerts")
      .select("*")
      .eq("client_id", user.client_id)
      .gt("created_at", lastSync);

    json(res, {
      success: true,
      sync_timestamp: syncTimestamp,
      changes: {
        tags: { created: [], updated: tags || [], deleted: [] },
        tasks: { created: [], updated: tasks || [], deleted: [] },
        alerts: { created: alerts || [], updated: [], deleted: [] }
      },
      conflicts
    }, 200, req);
  } catch (err) {
    error(res, err.message, 500, req);
  }
});

async function processTaskChange(user, change, conflicts) {
  const { id, server_id, action, data } = change;

  if (action === "update" && server_id) {
    // Check for conflicts
    const { data: serverTask } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", server_id)
      .single();

    if (serverTask && new Date(serverTask.updated_at) > new Date(data.updated_at)) {
      // Conflict detected
      conflicts.push({
        entity: "task",
        id: server_id,
        server_version: serverTask,
        client_version: data,
        resolution: "server_wins"
      });
      return;
    }

    await supabase
      .from("tasks")
      .update(data)
      .eq("id", server_id)
      .eq("client_id", user.client_id);
  }
}

module.exports = router;
```

#### 2.1.4 GET /api/mobile/tags/nearby

Find tags near a geographic location.

**Request (Query Parameters):**
```
?latitude=25.0478&longitude=121.5170&radius=1000
```

**Response:**
```json
{
  "tags": [
    {
      "mac": "AA:BB:CC:DD:EE:01",
      "name": "COLD-TRUCK-001",
      "latitude": 25.0480,
      "longitude": 121.5175,
      "distance_m": 55,
      "temperature": -2.3,
      "status": "normal",
      "last_seen_at": "2026-03-18T10:00:00Z"
    }
  ],
  "total": 1
}
```

### 2.2 Database Schema Additions

Add these tables to `supabase-schema.sql`:

```sql
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

-- User location tracking
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

-- Task management
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

-- Scan history
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

-- Notification preferences
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

-- Indexes
CREATE INDEX idx_mobile_devices_user ON mobile_devices(user_id);
CREATE INDEX idx_mobile_devices_fcm ON mobile_devices(fcm_token);
CREATE INDEX idx_user_locations_user ON user_locations(user_id, recorded_at DESC);
CREATE INDEX idx_tasks_client ON tasks(client_id);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to, status);
CREATE INDEX idx_tasks_status ON tasks(status, due_at);
CREATE INDEX idx_alerts_client ON alerts(client_id, created_at DESC);
CREATE INDEX idx_scan_history_mac ON scan_history(mac);
CREATE INDEX idx_scan_history_user ON scan_history(user_id, scanned_at DESC);

-- Triggers
CREATE TRIGGER mobile_devices_updated_at
  BEFORE UPDATE ON mobile_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function: Find nearby tags
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
    -- Get latest location for each tag from UTFind API data
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
      cos(radians(p_lat)) * cos(radians(ll.latitude)) *
      cos(radians(ll.longitude) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(ll.latitude))
    ))::DECIMAL as distance_m,
    ll.temperature,
    CASE
      WHEN ll.last_seen_at > now() - interval '1 hour' THEN 'online'
      ELSE 'offline'
    END as status,
    ll.last_seen_at
  FROM latest_locations ll
  WHERE (6371000 * acos(
    cos(radians(p_lat)) * cos(radians(ll.latitude)) *
    cos(radians(ll.longitude) - radians(p_lng)) +
    sin(radians(p_lat)) * sin(radians(ll.latitude))
  )) <= p_radius_m
  ORDER BY distance_m;
END;
$$ LANGUAGE plpgsql;

-- Enable realtime for mobile tables
ALTER PUBLICATION supabase_realtime ADD TABLE alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
```

---

## 3. Push Notification System

### 3.1 FCM Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Alert Detection Sources                           │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │  Temperature  │  │   Geofence    │  │    Battery    │               │
│  │   Threshold   │  │    Breach     │  │     Low       │               │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘               │
│          │                  │                  │                        │
│          └──────────────────┼──────────────────┘                        │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Supabase Database Trigger                    │   │
│  │  (sensor_data INSERT/UPDATE → check thresholds)                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                             │                                           │
│                             ▼                                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Supabase Edge Function                       │   │
│  │              (process-alert / send-notification)                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Push Service (lib/push.js)                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  1. Query notification_preferences                              │   │
│  │  2. Check quiet hours & rate limits                            │   │
│  │  3. Get FCM tokens from mobile_devices                          │   │
│  │  4. Format notification payload                                 │   │
│  │  5. Send via Firebase Admin SDK                                 │   │
│  │  6. Log to alerts table                                         │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Firebase Cloud Messaging                           │
│  ┌───────────────────┐              ┌───────────────────┐               │
│  │    APNs (iOS)     │              │  FCM (Android)    │               │
│  └─────────┬─────────┘              └─────────┬─────────┘               │
│            │                                  │                          │
│            ▼                                  ▼                          │
│  ┌───────────────────┐              ┌───────────────────┐               │
│  │   iOS Device      │              │  Android Device   │               │
│  │   UTtag App       │              │   UTtag App       │               │
│  └───────────────────┘              └───────────────────┘               │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Notification Payload Formats

#### Temperature Alert
```json
{
  "notification": {
    "title": "Temperature Alert",
    "body": "COLD-TRUCK-001: 12.3C (Limit: 8C)"
  },
  "data": {
    "type": "temperature",
    "tag_mac": "AA:BB:CC:DD:EE:01",
    "tag_name": "COLD-TRUCK-001",
    "temperature": "12.3",
    "threshold": "8.0",
    "latitude": "25.0478",
    "longitude": "121.5170",
    "timestamp": "2026-03-18T10:00:00Z",
    "alert_id": "uuid",
    "click_action": "OPEN_TAG_DETAIL"
  },
  "android": {
    "priority": "high",
    "notification": {
      "channel_id": "critical_alerts",
      "sound": "alert_high",
      "color": "#EF4444"
    }
  },
  "apns": {
    "payload": {
      "aps": {
        "sound": "alert_high.wav",
        "badge": 1,
        "category": "TEMPERATURE_ALERT",
        "interruption-level": "time-sensitive"
      }
    }
  }
}
```

#### SOS/Emergency Alert
```json
{
  "notification": {
    "title": "EMERGENCY SOS",
    "body": "SOS triggered by COLD-TRUCK-001"
  },
  "data": {
    "type": "sos",
    "tag_mac": "AA:BB:CC:DD:EE:01",
    "tag_name": "COLD-TRUCK-001",
    "latitude": "25.0478",
    "longitude": "121.5170",
    "timestamp": "2026-03-18T10:00:00Z",
    "alert_id": "uuid",
    "click_action": "OPEN_TAG_DETAIL"
  },
  "android": {
    "priority": "high",
    "notification": {
      "channel_id": "emergency_alerts",
      "sound": "sos_alarm",
      "color": "#DC2626",
      "vibrate_timings_millis": [0, 500, 200, 500, 200, 500]
    }
  },
  "apns": {
    "payload": {
      "aps": {
        "sound": {
          "critical": 1,
          "name": "sos_alarm.wav",
          "volume": 1.0
        },
        "badge": 1,
        "category": "SOS_ALERT",
        "interruption-level": "critical"
      }
    }
  }
}
```

#### Task Assignment
```json
{
  "notification": {
    "title": "New Task Assigned",
    "body": "Delivery to Carrefour Zhongshan - Due 14:00"
  },
  "data": {
    "type": "task",
    "task_id": "uuid",
    "task_title": "Delivery to Carrefour Zhongshan",
    "due_at": "2026-03-18T14:00:00Z",
    "location_name": "Carrefour Zhongshan",
    "latitude": "25.0612",
    "longitude": "121.5219",
    "click_action": "OPEN_TASK_DETAIL"
  },
  "android": {
    "notification": {
      "channel_id": "task_updates",
      "sound": "notification"
    }
  },
  "apns": {
    "payload": {
      "aps": {
        "sound": "default",
        "badge": 1,
        "category": "TASK_NOTIFICATION"
      }
    }
  }
}
```

### 3.3 Backend Changes

#### lib/push.js
```javascript
/**
 * Push Notification Service
 * Phase 4: Mobile App
 */

const admin = require("firebase-admin");
const { supabase } = require("./supabase");

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
    })
  });
}

const RATE_LIMITS = {
  sos: { cooldown: 0, maxPerHour: Infinity },
  temperature: { cooldown: 5 * 60 * 1000, maxPerHour: 12 },
  geofence: { cooldown: 10 * 60 * 1000, maxPerHour: 6 },
  battery: { cooldown: 60 * 60 * 1000, maxPerHour: 1 },
  offline: { cooldown: 4 * 60 * 60 * 1000, maxPerHour: 1 },
  task: { cooldown: 0, maxPerHour: Infinity }
};

/**
 * Send push notification for an alert
 */
async function sendAlertNotification({
  client_id,
  alert_type,
  tag_mac,
  tag_name,
  title,
  message,
  data = {},
  target_users = [] // If empty, send to all users with matching preferences
}) {
  try {
    // 1. Check rate limit
    const canSend = await checkRateLimit(client_id, alert_type, tag_mac);
    if (!canSend) {
      console.log(`[Push] Rate limited: ${alert_type} for ${tag_mac}`);
      return { sent: false, reason: "rate_limited" };
    }

    // 2. Get target users with their preferences
    let usersQuery = supabase
      .from("notification_preferences")
      .select(`
        user_id,
        push_enabled,
        ${alert_type}_enabled,
        quiet_hours_enabled,
        quiet_start,
        quiet_end,
        assigned_tags_only,
        tenant_users!inner(id, client_id)
      `)
      .eq("tenant_users.client_id", client_id)
      .eq("push_enabled", true)
      .eq(`${alert_type}_enabled`, true);

    if (target_users.length > 0) {
      usersQuery = usersQuery.in("user_id", target_users);
    }

    const { data: preferences } = await usersQuery;
    if (!preferences?.length) {
      return { sent: false, reason: "no_eligible_users" };
    }

    // 3. Filter by quiet hours
    const eligibleUsers = preferences.filter(pref => {
      if (!pref.quiet_hours_enabled) return true;
      if (alert_type === "sos") return true; // SOS bypasses quiet hours
      return !isInQuietHours(pref.quiet_start, pref.quiet_end);
    });

    if (!eligibleUsers.length) {
      return { sent: false, reason: "quiet_hours" };
    }

    // 4. Get FCM tokens
    const userIds = eligibleUsers.map(u => u.user_id);
    const { data: devices } = await supabase
      .from("mobile_devices")
      .select("fcm_token, device_type, user_id")
      .in("user_id", userIds)
      .eq("status", "active");

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

    // 6. Send to FCM
    const tokens = devices.map(d => d.fcm_token);
    const response = await admin.messaging().sendEachForMulticast({
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
      }
    }

    // 8. Log alert
    await supabase.from("alerts").insert({
      client_id,
      alert_type,
      severity: getSeverity(alert_type),
      tag_mac,
      tag_name,
      title,
      message,
      data,
      sent_to: userIds
    });

    return {
      sent: true,
      success_count: response.successCount,
      failure_count: response.failureCount
    };
  } catch (err) {
    console.error("[Push] Error:", err);
    return { sent: false, reason: "error", error: err.message };
  }
}

function buildNotificationPayload({ alert_type, tag_mac, tag_name, title, message, data }) {
  const basePayload = {
    notification: { title, body: message },
    data: {
      type: alert_type,
      tag_mac: tag_mac || "",
      tag_name: tag_name || "",
      timestamp: new Date().toISOString(),
      ...Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)])
      )
    }
  };

  // Add platform-specific options
  switch (alert_type) {
    case "sos":
      return {
        ...basePayload,
        android: {
          priority: "high",
          notification: {
            channelId: "emergency_alerts",
            sound: "sos_alarm",
            color: "#DC2626"
          }
        },
        apns: {
          payload: {
            aps: {
              sound: { critical: 1, name: "sos_alarm.wav", volume: 1.0 },
              "interruption-level": "critical"
            }
          }
        }
      };

    case "temperature":
      return {
        ...basePayload,
        android: {
          priority: "high",
          notification: {
            channelId: "critical_alerts",
            sound: "alert_high",
            color: "#EF4444"
          }
        },
        apns: {
          payload: {
            aps: {
              sound: "alert_high.wav",
              "interruption-level": "time-sensitive"
            }
          }
        }
      };

    default:
      return {
        ...basePayload,
        android: {
          notification: {
            channelId: "standard_alerts",
            sound: "default"
          }
        },
        apns: {
          payload: {
            aps: { sound: "default" }
          }
        }
      };
  }
}

async function checkRateLimit(client_id, alert_type, tag_mac) {
  const limits = RATE_LIMITS[alert_type];
  if (!limits || limits.cooldown === 0) return true;

  const cooldownTime = new Date(Date.now() - limits.cooldown).toISOString();

  const { data: recentAlerts } = await supabase
    .from("alerts")
    .select("id")
    .eq("client_id", client_id)
    .eq("alert_type", alert_type)
    .eq("tag_mac", tag_mac)
    .gt("created_at", cooldownTime);

  return !recentAlerts?.length;
}

function isInQuietHours(start, end) {
  if (!start || !end) return false;

  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentTime >= startMinutes && currentTime < endMinutes;
  } else {
    // Overnight quiet hours (e.g., 22:00 - 07:00)
    return currentTime >= startMinutes || currentTime < endMinutes;
  }
}

function getSeverity(alert_type) {
  switch (alert_type) {
    case "sos": return "critical";
    case "temperature": return "high";
    case "geofence": return "medium";
    default: return "low";
  }
}

module.exports = {
  sendAlertNotification
};
```

### 3.4 Supabase Database Trigger

```sql
-- Trigger function for temperature alerts
CREATE OR REPLACE FUNCTION check_temperature_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_binding RECORD;
  v_client RECORD;
BEGIN
  -- Find sensor bindings with thresholds
  FOR v_binding IN
    SELECT sb.*, ct.client_id, ct.label
    FROM sensor_bindings sb
    JOIN client_tags ct ON ct.mac = sb.mac
    WHERE sb.mac = NEW.mac
      AND sb.enabled = true
      AND sb.sensor_type IN ('temperature', 'all')
      AND sb.max_threshold IS NOT NULL
  LOOP
    -- Check if temperature exceeds threshold
    IF NEW.temperature > v_binding.max_threshold THEN
      -- Insert into alerts (will trigger Edge Function)
      INSERT INTO alerts (
        client_id,
        alert_type,
        severity,
        tag_mac,
        tag_name,
        title,
        message,
        data
      ) VALUES (
        v_binding.client_id,
        'temperature',
        'high',
        NEW.mac,
        v_binding.label,
        'Temperature Alert',
        format('%s: %.1fC exceeds limit %.1fC',
               COALESCE(v_binding.label, NEW.mac),
               NEW.temperature,
               v_binding.max_threshold),
        jsonb_build_object(
          'temperature', NEW.temperature,
          'threshold', v_binding.max_threshold,
          'latitude', NEW.latitude,
          'longitude', NEW.longitude
        )
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER sensor_data_temperature_alert
  AFTER INSERT ON sensor_data
  FOR EACH ROW
  WHEN (NEW.temperature IS NOT NULL)
  EXECUTE FUNCTION check_temperature_alert();
```

---

## 4. Offline Mode Architecture

### 4.1 WatermelonDB Schema

```typescript
// database/schema.ts
import { appSchema, tableSchema } from "@nozbe/watermelondb";

export default appSchema({
  version: 1,
  tables: [
    // Tags cache
    tableSchema({
      name: "tags",
      columns: [
        { name: "mac", type: "string", isIndexed: true },
        { name: "name", type: "string" },
        { name: "temperature", type: "number", isOptional: true },
        { name: "humidity", type: "number", isOptional: true },
        { name: "battery", type: "number", isOptional: true },
        { name: "latitude", type: "number", isOptional: true },
        { name: "longitude", type: "number", isOptional: true },
        { name: "status", type: "string" },
        { name: "last_seen_at", type: "number" },
        { name: "server_updated_at", type: "number" },
        { name: "synced_at", type: "number" }
      ]
    }),

    // Tasks (with offline support)
    tableSchema({
      name: "tasks",
      columns: [
        { name: "server_id", type: "string", isOptional: true, isIndexed: true },
        { name: "title", type: "string" },
        { name: "description", type: "string", isOptional: true },
        { name: "task_type", type: "string" },
        { name: "status", type: "string", isIndexed: true },
        { name: "priority", type: "string" },
        { name: "due_at", type: "number", isOptional: true },
        { name: "completed_at", type: "number", isOptional: true },
        { name: "location_name", type: "string", isOptional: true },
        { name: "latitude", type: "number", isOptional: true },
        { name: "longitude", type: "number", isOptional: true },
        { name: "tag_macs", type: "string" }, // JSON array
        { name: "checklist", type: "string" }, // JSON array
        { name: "notes", type: "string", isOptional: true },
        { name: "is_pending_sync", type: "boolean" },
        { name: "synced_at", type: "number" }
      ]
    }),

    // Alerts cache
    tableSchema({
      name: "alerts",
      columns: [
        { name: "server_id", type: "string", isIndexed: true },
        { name: "alert_type", type: "string" },
        { name: "severity", type: "string" },
        { name: "tag_mac", type: "string", isOptional: true },
        { name: "tag_name", type: "string", isOptional: true },
        { name: "title", type: "string" },
        { name: "message", type: "string" },
        { name: "is_read", type: "boolean" },
        { name: "created_at", type: "number", isIndexed: true }
      ]
    }),

    // Scan history (offline-first)
    tableSchema({
      name: "scan_history",
      columns: [
        { name: "mac", type: "string", isIndexed: true },
        { name: "latitude", type: "number", isOptional: true },
        { name: "longitude", type: "number", isOptional: true },
        { name: "scanned_at", type: "number", isIndexed: true },
        { name: "is_pending_sync", type: "boolean" }
      ]
    }),

    // Pending photos (for upload)
    tableSchema({
      name: "pending_photos",
      columns: [
        { name: "task_id", type: "string", isIndexed: true },
        { name: "local_uri", type: "string" },
        { name: "type", type: "string" }, // 'delivery', 'signature', 'other'
        { name: "captured_at", type: "number" },
        { name: "latitude", type: "number", isOptional: true },
        { name: "longitude", type: "number", isOptional: true },
        { name: "upload_status", type: "string" }, // 'pending', 'uploading', 'uploaded', 'failed'
        { name: "remote_url", type: "string", isOptional: true }
      ]
    }),

    // Sync metadata
    tableSchema({
      name: "sync_meta",
      columns: [
        { name: "key", type: "string", isIndexed: true },
        { name: "value", type: "string" },
        { name: "updated_at", type: "number" }
      ]
    })
  ]
});
```

### 4.2 Sync Conflict Resolution

```typescript
// database/sync/conflictResolver.ts
import { Task, TaskCompletion } from "../../types";

export type ConflictResolution = "server_wins" | "client_wins" | "merge" | "manual";

export interface Conflict<T> {
  entity: string;
  id: string;
  serverVersion: T;
  clientVersion: T;
  resolution: ConflictResolution;
  resolvedData?: T;
}

/**
 * Resolve task conflicts
 */
export function resolveTaskConflict(
  serverTask: Task,
  clientTask: Task
): Conflict<Task> {
  // Rule 1: If both completed, keep earliest completion time
  if (serverTask.status === "completed" && clientTask.status === "completed") {
    const serverTime = new Date(serverTask.completed_at!).getTime();
    const clientTime = new Date(clientTask.completed_at!).getTime();

    return {
      entity: "task",
      id: serverTask.id,
      serverVersion: serverTask,
      clientVersion: clientTask,
      resolution: serverTime < clientTime ? "server_wins" : "client_wins",
      resolvedData: serverTime < clientTime ? serverTask : clientTask
    };
  }

  // Rule 2: Completed beats non-completed
  if (serverTask.status === "completed") {
    return {
      entity: "task",
      id: serverTask.id,
      serverVersion: serverTask,
      clientVersion: clientTask,
      resolution: "server_wins",
      resolvedData: serverTask
    };
  }

  if (clientTask.status === "completed") {
    return {
      entity: "task",
      id: serverTask.id,
      serverVersion: serverTask,
      clientVersion: clientTask,
      resolution: "client_wins",
      resolvedData: clientTask
    };
  }

  // Rule 3: For in-progress tasks, merge data
  if (serverTask.status === "in_progress" && clientTask.status === "in_progress") {
    const merged = mergeTaskData(serverTask, clientTask);
    return {
      entity: "task",
      id: serverTask.id,
      serverVersion: serverTask,
      clientVersion: clientTask,
      resolution: "merge",
      resolvedData: merged
    };
  }

  // Rule 4: Default to server wins for other cases
  return {
    entity: "task",
    id: serverTask.id,
    serverVersion: serverTask,
    clientVersion: clientTask,
    resolution: "server_wins",
    resolvedData: serverTask
  };
}

/**
 * Merge task data from server and client
 */
function mergeTaskData(serverTask: Task, clientTask: Task): Task {
  // Merge checklists (union of completed items)
  const serverChecklist = JSON.parse(serverTask.checklist || "[]");
  const clientChecklist = JSON.parse(clientTask.checklist || "[]");

  const mergedChecklist = serverChecklist.map((item: any, idx: number) => ({
    ...item,
    completed: item.completed || clientChecklist[idx]?.completed
  }));

  // Merge notes
  const mergedNotes = [serverTask.notes, clientTask.notes]
    .filter(Boolean)
    .join("\n---\n");

  return {
    ...serverTask,
    checklist: JSON.stringify(mergedChecklist),
    notes: mergedNotes,
    updated_at: new Date().toISOString()
  };
}

/**
 * Conflict resolution for tags (server always wins)
 */
export function resolveTagConflict(serverTag: any, clientTag: any): Conflict<any> {
  return {
    entity: "tag",
    id: serverTag.mac,
    serverVersion: serverTag,
    clientVersion: clientTag,
    resolution: "server_wins",
    resolvedData: serverTag
  };
}
```

### 4.3 Data Priority (Offline Cache)

| Data Type | Priority | Cache Strategy | Max Age |
|-----------|----------|----------------|---------|
| User session | Critical | Secure storage | Until logout |
| Tag list | High | Full cache | 24 hours |
| Tag latest data | High | Full cache | 1 hour |
| Active tasks | High | Full cache | Until completed |
| Completed tasks | Medium | Last 7 days | 7 days |
| Alerts | Medium | Last 100 | 7 days |
| Scan history | High | All pending | Until synced |
| Temperature history | Low | Last 24h per tag | 24 hours |
| Photos | High | Until uploaded | Until synced |

```typescript
// services/sync/syncService.ts
import { Database } from "@nozbe/watermelondb";
import NetInfo from "@react-native-community/netinfo";
import { api } from "../api/client";

class SyncService {
  private db: Database;
  private isSyncing = false;
  private lastSyncAt: Date | null = null;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Perform full sync
   */
  async performSync(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: false, reason: "sync_in_progress" };
    }

    const netInfo = await NetInfo.fetch();
    if (!netInfo.isConnected) {
      return { success: false, reason: "offline" };
    }

    this.isSyncing = true;

    try {
      // 1. Push pending changes
      await this.pushPendingChanges();

      // 2. Pull server changes
      await this.pullServerChanges();

      // 3. Upload pending photos
      await this.uploadPendingPhotos();

      // 4. Update sync metadata
      this.lastSyncAt = new Date();
      await this.updateSyncMeta("last_sync_at", this.lastSyncAt.toISOString());

      return { success: true };
    } catch (err) {
      console.error("[Sync] Error:", err);
      return { success: false, reason: "error", error: err.message };
    } finally {
      this.isSyncing = false;
    }
  }

  private async pushPendingChanges() {
    // Get pending tasks
    const pendingTasks = await this.db
      .get("tasks")
      .query(Q.where("is_pending_sync", true))
      .fetch();

    // Get pending scans
    const pendingScans = await this.db
      .get("scan_history")
      .query(Q.where("is_pending_sync", true))
      .fetch();

    if (!pendingTasks.length && !pendingScans.length) {
      return;
    }

    const response = await api.post("/api/mobile/sync", {
      last_sync_at: this.lastSyncAt?.toISOString(),
      pending_changes: {
        tasks: pendingTasks.map(t => ({
          id: t.id,
          server_id: t.serverId,
          action: "update",
          data: t._raw
        })),
        scans: pendingScans.map(s => ({
          mac: s.mac,
          scanned_at: new Date(s.scannedAt).toISOString(),
          latitude: s.latitude,
          longitude: s.longitude
        }))
      }
    });

    // Mark as synced
    await this.db.write(async () => {
      for (const task of pendingTasks) {
        await task.update(t => {
          t.isPendingSync = false;
          t.syncedAt = Date.now();
        });
      }
      for (const scan of pendingScans) {
        await scan.update(s => {
          s.isPendingSync = false;
        });
      }
    });

    return response.data;
  }

  private async pullServerChanges() {
    const response = await api.post("/api/mobile/sync", {
      last_sync_at: this.lastSyncAt?.toISOString(),
      pending_changes: {}
    });

    const { changes } = response.data;

    await this.db.write(async () => {
      // Update tags
      for (const tag of changes.tags.updated) {
        await this.upsertTag(tag);
      }

      // Update tasks
      for (const task of [...changes.tasks.created, ...changes.tasks.updated]) {
        await this.upsertTask(task);
      }

      // Insert new alerts
      for (const alert of changes.alerts.created) {
        await this.insertAlert(alert);
      }
    });
  }

  private async uploadPendingPhotos() {
    const pendingPhotos = await this.db
      .get("pending_photos")
      .query(Q.where("upload_status", "pending"))
      .fetch();

    for (const photo of pendingPhotos) {
      try {
        await photo.update(p => { p.uploadStatus = "uploading"; });

        const formData = new FormData();
        formData.append("file", {
          uri: photo.localUri,
          type: "image/jpeg",
          name: `photo_${photo.id}.jpg`
        });
        formData.append("task_id", photo.taskId);
        formData.append("type", photo.type);

        const response = await api.post("/api/mobile/photos/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });

        await photo.update(p => {
          p.uploadStatus = "uploaded";
          p.remoteUrl = response.data.url;
        });
      } catch (err) {
        await photo.update(p => { p.uploadStatus = "failed"; });
      }
    }
  }

  // Helper methods...
  private async upsertTag(tagData: any) { /* ... */ }
  private async upsertTask(taskData: any) { /* ... */ }
  private async insertAlert(alertData: any) { /* ... */ }
  private async updateSyncMeta(key: string, value: string) { /* ... */ }
}

export const syncService = new SyncService(database);
```

---

## 5. Screen Specifications

### 5.1 Tab Navigator Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Tab Navigator                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │   Map    │  │   Tags   │  │   Scan   │  │  Tasks   │  │ Profile  │  │
│  │    📍    │  │    🏷    │  │    📷    │  │    ✓     │  │    👤    │  │
│  │  (Tab1)  │  │  (Tab2)  │  │  (FAB)   │  │  (Tab3)  │  │  (Tab4)  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Map Screen

**Purpose:** Real-time tag map with clustering and status visualization.

**Wireframe:**
```
┌─────────────────────────────────────────┐
│ UTtag                              ⚙️ 🔔 │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │                                 │   │
│  │         [MAP VIEW]              │   │
│  │                                 │   │
│  │    📍  📍       📍              │   │
│  │         📍  📍📍                │   │
│  │    📍         [12]              │   │
│  │              (cluster)          │   │
│  │                                 │   │
│  │                                 │   │
│  │    [+]  [-]  [📍]               │   │
│  │    (zoom) (locate me)           │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ 🔍 Search tags...          [⊟]  │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Filter: [All ▼] [Normal] [Alert] [Off]│
│                                         │
├─────────────────────────────────────────┤
│  [📍]    [🏷]    [📷]    [✓]    [👤]   │
│   Map     Tags   Scan   Tasks  Profile  │
└─────────────────────────────────────────┘
```

**Components:**
| Component | Description |
|-----------|-------------|
| `MapView` | Mapbox GL map with custom styling |
| `TagMarker` | Custom marker showing status color |
| `TagCluster` | Cluster marker with count badge |
| `MapControls` | Zoom, locate me, layer toggle |
| `SearchBar` | Tag search with autocomplete |
| `FilterChips` | Quick status filters |
| `TagQuickView` | Bottom sheet on marker tap |

**Data Requirements:**
- All tags for current tenant (`client_id`)
- Latest sensor data per tag
- Current user location (with permission)

**Actions:**
- Tap marker: Show quick view bottom sheet
- Tap cluster: Zoom to cluster bounds
- Tap "Locate me": Center on user location
- Search: Filter visible markers
- Pull map: Refresh tag data

### 5.3 Tags Screen

**Purpose:** Tag list with search, filter, and detail access.

**Wireframe:**
```
┌─────────────────────────────────────────┐
│ Tags                         [⊟] 🔔 (3) │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │ 🔍 Search by name or MAC...        │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [All 156] [Alert 3] [Offline 12]       │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔴 COLD-TRUCK-001                   │ │
│ │ 🌡️ 12.3°C (!) │ 🔋 87% │ 2m ago   │ │
│ │ 📍 Taipei, Zhongshan District       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🟢 FREEZER-A-003                    │ │
│ │ 🌡️ -18.5°C │ 🔋 92% │ 5m ago       │ │
│ │ 📍 Warehouse A                       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🟡 DELIVERY-VAN-12                  │ │
│ │ 🌡️ 4.2°C │ 🔋 45% │ 35m ago        │ │
│ │ 📍 Last: New Taipei City            │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ↓ Pull to refresh                       │
├─────────────────────────────────────────┤
│  [📍]    [🏷]    [📷]    [✓]    [👤]   │
└─────────────────────────────────────────┘
```

**Components:**
| Component | Description |
|-----------|-------------|
| `SearchBar` | Search with debounce |
| `FilterTabs` | Status filter tabs with counts |
| `TagCard` | Card showing tag summary |
| `StatusIndicator` | Color-coded status dot |
| `RefreshControl` | Pull-to-refresh |

**Data Requirements:**
- Tag list from `client_tags` with `sensor_data`
- Filter counts per status
- Last update timestamps

**Actions:**
- Tap card: Navigate to TagDetailScreen
- Swipe left: Quick actions (navigate, history)
- Pull down: Refresh data
- Search: Filter list in real-time

### 5.4 Tag Detail Screen

**Wireframe:**
```
┌─────────────────────────────────────────┐
│ ← COLD-TRUCK-001                    ⋮   │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │              [Mini Map]             │ │
│ │                 📍                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│  Status: 🔴 Temperature Alert           │
│  Last Update: 2 minutes ago             │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🌡️ Temperature                      │ │
│ │                                     │ │
│ │   12.3°C                    ⚠️      │ │
│ │   (Limit: 8°C)                      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 💧 Humidity        │ 🔋 Battery     │ │
│ │    65% RH          │    87%         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ Temperature (24h)                   │ │
│ │  ▁▂▃▄█████████▆▅▄▃▂▁               │ │
│ │  -5°C ─────────────────── 15°C      │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Alert History (3)                       │
│ • 10:32 - Temperature exceeded 8°C      │
│ • 09:15 - Temperature exceeded 8°C      │
│ • Yesterday - Battery below 20%         │
│                                         │
│ ┌───────────────┐  ┌───────────────┐   │
│ │  🧭 Navigate  │  │  📋 History   │   │
│ └───────────────┘  └───────────────┘   │
└─────────────────────────────────────────┘
```

**Components:**
| Component | Description |
|-----------|-------------|
| `MiniMap` | Static map centered on tag |
| `StatusBanner` | Alert status with color |
| `MetricCard` | Temperature, humidity, battery |
| `TemperatureChart` | Victory Native line chart |
| `AlertHistoryList` | Recent alerts for tag |
| `ActionButtons` | Navigate, View History |

### 5.5 Tasks Screen

**Wireframe:**
```
┌─────────────────────────────────────────┐
│ My Tasks                         + 🔔   │
├─────────────────────────────────────────┤
│ [Today (5)] [This Week (12)] [All]      │
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ⚠️ Delivery to Carrefour Zhongshan  │ │
│ │ 📍 Taipei, Zhongshan District       │ │
│ │ ⏰ Due 14:00        🔴 Overdue 30m   │ │
│ │ 🏷️ 3 tags                           │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔵 Goods Receipt - Freezer A        │ │
│ │ 📍 Company Warehouse                │ │
│ │ ⏰ Due 16:00                        │ │
│ │ 🏷️ 8 tags                           │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Completed Today                         │
│ ┌─────────────────────────────────────┐ │
│ │ ✓ Equipment Inspection - Fleet      │ │
│ │   Completed 09:45                   │ │
│ └─────────────────────────────────────┘ │
│                                         │
├─────────────────────────────────────────┤
│  [📍]    [🏷]    [📷]    [✓]    [👤]   │
└─────────────────────────────────────────┘
```

**Components:**
| Component | Description |
|-----------|-------------|
| `FilterTabs` | Today, Week, All filters |
| `TaskCard` | Task summary with status |
| `OverdueIndicator` | Red badge for overdue |
| `CompletedSection` | Collapsible completed tasks |

### 5.6 Alerts Screen (in Profile tab)

**Wireframe:**
```
┌─────────────────────────────────────────┐
│ ← Alert History                         │
├─────────────────────────────────────────┤
│ [All] [Temperature] [Geofence] [Task]   │
├─────────────────────────────────────────┤
│                                         │
│ Today                                   │
│ ┌─────────────────────────────────────┐ │
│ │ 🔴 Temperature Alert                 │ │
│ │ COLD-TRUCK-001: 12.3°C              │ │
│ │ 10:32 AM                             │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🟠 Battery Low                       │ │
│ │ DELIVERY-VAN-05: 15%                 │ │
│ │ 09:15 AM                             │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Yesterday                               │
│ ┌─────────────────────────────────────┐ │
│ │ 🟡 Geofence Alert                    │ │
│ │ FREEZER-UNIT-02 left zone           │ │
│ │ 4:45 PM                              │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

### 5.7 Profile Screen

**Wireframe:**
```
┌─────────────────────────────────────────┐
│ Profile                            ⚙️   │
├─────────────────────────────────────────┤
│                                         │
│         ┌─────────────┐                 │
│         │     👤      │                 │
│         │   Avatar    │                 │
│         └─────────────┘                 │
│            John Chen                    │
│         john@company.com                │
│         Company ABC                     │
│                                         │
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 🔔 Notification Settings        >   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 📜 Alert History                >   │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 🌙 Dark Mode                  [ON]  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 🌐 Language                  zh-TW  │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ 📴 Offline Data              12 MB  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │        🚪 Sign Out                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ v1.0.0 (Build 123)                      │
├─────────────────────────────────────────┤
│  [📍]    [🏷]    [📷]    [✓]    [👤]   │
└─────────────────────────────────────────┘
```

---

## 6. QR Code Scanner

### 6.1 Camera Integration

Using `react-native-vision-camera` for high-performance QR scanning.

```typescript
// screens/scan/ScanScreen.tsx
import React, { useState, useCallback } from "react";
import { View, StyleSheet, TouchableOpacity, Text, Alert } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCodeScanner
} from "react-native-vision-camera";
import { useNavigation } from "@react-navigation/native";
import { useTagStore } from "../../stores/tagStore";
import { Haptics } from "../../utils/haptics";

const QR_FORMAT = /^uttag:\/\/mac\/([A-Fa-f0-9:]{17})$/;

export function ScanScreen() {
  const navigation = useNavigation();
  const device = useCameraDevice("back");
  const [torch, setTorch] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const { fetchTagByMac } = useTagStore();

  const codeScanner = useCodeScanner({
    codeTypes: ["qr", "code-128", "code-39"],
    onCodeScanned: useCallback(async (codes) => {
      if (scannedCode) return; // Prevent duplicate scans

      const code = codes[0];
      if (!code?.value) return;

      setScannedCode(code.value);
      Haptics.notificationSuccess();

      // Parse QR code
      const mac = parseQRCode(code.value);

      if (mac) {
        // Valid UTtag QR code
        try {
          const tag = await fetchTagByMac(mac);
          if (tag) {
            navigation.navigate("TagDetail", { mac, fromScan: true });
          } else {
            Alert.alert(
              "Tag Not Found",
              `MAC: ${mac}\nThis tag is not bound to your account.`,
              [
                { text: "OK", onPress: () => setScannedCode(null) },
                { text: "Manual Entry", onPress: () => navigation.navigate("ManualEntry") }
              ]
            );
          }
        } catch (err) {
          Alert.alert("Error", err.message);
          setScannedCode(null);
        }
      } else {
        // Invalid QR format
        Alert.alert(
          "Invalid QR Code",
          "This QR code is not a valid UTtag format.",
          [
            { text: "Try Again", onPress: () => setScannedCode(null) },
            { text: "Manual Entry", onPress: () => navigation.navigate("ManualEntry") }
          ]
        );
      }
    }, [scannedCode, fetchTagByMac, navigation])
  });

  if (!device) {
    return (
      <View style={styles.container}>
        <Text>Camera not available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        codeScanner={codeScanner}
        torch={torch ? "on" : "off"}
      />

      {/* Scan overlay */}
      <View style={styles.overlay}>
        <View style={styles.scanFrame}>
          <View style={styles.corner} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>

        <Text style={styles.instruction}>
          Place QR Code inside frame
        </Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.torchButton}
          onPress={() => setTorch(!torch)}
        >
          <Text style={styles.torchText}>
            {torch ? "💡 Flash On" : "🔦 Flash Off"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.manualButton}
          onPress={() => navigation.navigate("ManualEntry")}
        >
          <Text style={styles.manualText}>Manual MAC Entry</Text>
        </TouchableOpacity>
      </View>

      {/* Recent scans */}
      <RecentScans />
    </View>
  );
}

function parseQRCode(value: string): string | null {
  // Format 1: uttag://mac/AA:BB:CC:DD:EE:FF
  const match = value.match(QR_FORMAT);
  if (match) {
    return match[1].toUpperCase();
  }

  // Format 2: Plain MAC address
  const macMatch = value.match(/^([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}$/);
  if (macMatch) {
    return value.toUpperCase().replace(/-/g, ":");
  }

  return null;
}
```

### 6.2 QR Code Format

**Primary Format:**
```
uttag://mac/{MAC_ADDRESS}
```

**Examples:**
- `uttag://mac/AA:BB:CC:DD:EE:01`
- `uttag://mac/aa:bb:cc:dd:ee:01` (case insensitive)

**Fallback Formats Supported:**
- Plain MAC: `AA:BB:CC:DD:EE:01`
- Hyphenated: `AA-BB-CC-DD-EE-01`
- CODE128 barcode: `AABBCCDDEEFF`

### 6.3 Fallback for Invalid Codes

```typescript
// components/scanner/ManualEntryScreen.tsx
import React, { useState } from "react";
import { View, TextInput, Button, Text, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTagStore } from "../../stores/tagStore";

export function ManualEntryScreen() {
  const [mac, setMac] = useState("");
  const navigation = useNavigation();
  const { fetchTagByMac } = useTagStore();

  const formatMac = (input: string): string => {
    // Remove non-hex characters and format as AA:BB:CC:DD:EE:FF
    const hex = input.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
    const pairs = hex.match(/.{1,2}/g) || [];
    return pairs.slice(0, 6).join(":");
  };

  const handleSubmit = async () => {
    const formatted = formatMac(mac);

    if (formatted.length !== 17) {
      Alert.alert("Invalid MAC", "Please enter a valid MAC address (12 hex characters)");
      return;
    }

    try {
      const tag = await fetchTagByMac(formatted);
      if (tag) {
        navigation.navigate("TagDetail", { mac: formatted, fromScan: true });
      } else {
        Alert.alert("Tag Not Found", "This tag is not bound to your account.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Enter MAC Address</Text>
      <TextInput
        style={styles.input}
        value={mac}
        onChangeText={(text) => setMac(formatMac(text))}
        placeholder="AA:BB:CC:DD:EE:FF"
        autoCapitalize="characters"
        maxLength={17}
      />
      <Text style={styles.preview}>
        Preview: {formatMac(mac) || "—"}
      </Text>
      <Button title="Look Up Tag" onPress={handleSubmit} />
    </View>
  );
}
```

---

## 7. Integration Diagram

### 7.1 Mobile to Backend Connection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Mobile App                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        React Native                                  │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │    │
│  │  │    Screens   │  │   Zustand    │  │      WatermelonDB        │   │    │
│  │  │              │  │   Stores     │  │    (Offline Cache)       │   │    │
│  │  └──────┬───────┘  └──────┬───────┘  └──────────────┬───────────┘   │    │
│  │         │                 │                         │                │    │
│  │         └─────────────────┼─────────────────────────┘                │    │
│  │                           │                                          │    │
│  │                    ┌──────┴───────┐                                  │    │
│  │                    │  API Client  │                                  │    │
│  │                    │ (Axios + RQ) │                                  │    │
│  │                    └──────┬───────┘                                  │    │
│  └───────────────────────────┼──────────────────────────────────────────┘    │
│                              │                                               │
│  ┌───────────────────────────┼──────────────────────────────────────────┐   │
│  │                    Native Modules                                     │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │   │
│  │  │     FCM      │  │   Keychain   │  │   Location   │                │   │
│  │  │   Service    │  │  /Keystore   │  │   Service    │                │   │
│  │  └──────┬───────┘  └──────────────┘  └──────┬───────┘                │   │
│  │         │                                   │                         │   │
│  └─────────┼───────────────────────────────────┼─────────────────────────┘   │
│            │                                   │                             │
└────────────┼───────────────────────────────────┼─────────────────────────────┘
             │                                   │
             │ FCM Token                         │ User Location
             │                                   │
┌────────────┼───────────────────────────────────┼─────────────────────────────┐
│            │          HTTPS / WSS              │                             │
│            │                                   │                             │
│  ┌─────────▼────────────────────┐  ┌──────────▼──────────────────────────┐  │
│  │                              │  │                                      │  │
│  │   Firebase Cloud Messaging   │  │         Express.js Backend           │  │
│  │                              │  │                                      │  │
│  │  • Push notification delivery │  │  • REST API endpoints               │  │
│  │  • Token management          │  │  • JWT authentication               │  │
│  │                              │  │  • Rate limiting                    │  │
│  └──────────────────────────────┘  │  • Request validation               │  │
│                                     │                                      │  │
│                                     │  Routes:                             │  │
│                                     │  /api/tenant/auth/*                  │  │
│                                     │  /api/mobile/*                       │  │
│                                     │  /api/sensors/*                      │  │
│                                     │                                      │  │
│                                     └────────────────┬───────────────────────┘  │
│                                                      │                          │
│                                            ┌─────────▼─────────┐               │
│                                            │                   │               │
│                                            │     Supabase      │               │
│                                            │                   │               │
│                                            │  • PostgreSQL DB  │               │
│                                            │  • Realtime       │               │
│                                            │  • Storage        │               │
│                                            │  • Edge Functions │               │
│                                            │                   │               │
│                                            └───────────────────┘               │
│                                                                                 │
│                                      UTtag Backend Infrastructure               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Real-time Update Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   IoT Device    │────▶│   UTFind API    │────▶│    Supabase     │
│   (Tag/Sensor)  │     │   (External)    │     │   sensor_data   │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         │ INSERT trigger
                                                         ▼
                                                ┌─────────────────┐
                                                │  Edge Function  │
                                                │ (check alerts)  │
                                                └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┼────────────────────────────────┐
                        │                                │                                │
                        ▼                                ▼                                ▼
               ┌─────────────────┐              ┌─────────────────┐              ┌─────────────────┐
               │  Realtime Sub   │              │    Push (FCM)   │              │   alerts table  │
               │  (WebSocket)    │              │                 │              │                 │
               └────────┬────────┘              └────────┬────────┘              └─────────────────┘
                        │                                │
                        │                                │
                        ▼                                ▼
               ┌─────────────────────────────────────────────────┐
               │                   Mobile App                     │
               │                                                  │
               │  WebSocket:                 Push:               │
               │  • Update tag marker        • Show notification │
               │  • Refresh temperature      • Badge count       │
               │  • Update list              • Alert sound       │
               │                                                  │
               └─────────────────────────────────────────────────┘
```

### 7.3 Offline Sync Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OFFLINE MODE                                    │
│                                                                              │
│  User Actions                    Local Storage                               │
│  ┌──────────────────┐           ┌──────────────────────────────────────┐   │
│  │ • Complete task  │──────────▶│            WatermelonDB              │   │
│  │ • Scan QR code   │           │                                      │   │
│  │ • Take photo     │           │  ┌────────────┐  ┌────────────────┐  │   │
│  │ • Add notes      │           │  │ tasks      │  │ pending_photos │  │   │
│  │                  │           │  │ (modified) │  │ (queued)       │  │   │
│  └──────────────────┘           │  └────────────┘  └────────────────┘  │   │
│                                  │                                      │   │
│                                  │  ┌────────────┐  ┌────────────────┐  │   │
│                                  │  │scan_history│  │   sync_meta    │  │   │
│                                  │  │ (pending)  │  │ (last_sync_at) │  │   │
│                                  │  └────────────┘  └────────────────┘  │   │
│                                  └──────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  │ Network restored
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SYNC PROCESS                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Sync Service                                   │  │
│  │                                                                       │  │
│  │  Step 1: Push Local Changes                                          │  │
│  │  ─────────────────────────                                           │  │
│  │  POST /api/mobile/sync                                               │  │
│  │  { pending_changes: { tasks: [...], scans: [...] } }                 │  │
│  │                                                                       │  │
│  │  Step 2: Handle Conflicts                                            │  │
│  │  ───────────────────────                                             │  │
│  │  • Server returns conflicts[]                                        │  │
│  │  • Apply resolution strategy                                         │  │
│  │  • Prompt user if manual resolution needed                           │  │
│  │                                                                       │  │
│  │  Step 3: Pull Server Changes                                         │  │
│  │  ────────────────────────                                            │  │
│  │  • Receive changes since last_sync_at                                │  │
│  │  • Update local database                                             │  │
│  │                                                                       │  │
│  │  Step 4: Upload Photos                                               │  │
│  │  ──────────────────────                                              │  │
│  │  • Upload pending_photos to Supabase Storage                         │  │
│  │  • Update remote_url on success                                      │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Security

### 8.1 Token Storage (Keychain/Keystore)

Using `react-native-keychain` for secure credential storage.

```typescript
// services/storage/secureStorage.ts
import * as Keychain from "react-native-keychain";

const SERVICE_NAME = "com.uttag.mobile";

export const SecureStorage = {
  /**
   * Store JWT token securely
   */
  async setToken(token: string): Promise<boolean> {
    try {
      await Keychain.setGenericPassword("jwt_token", token, {
        service: SERVICE_NAME,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE
      });
      return true;
    } catch (err) {
      console.error("[SecureStorage] Failed to store token:", err);
      return false;
    }
  },

  /**
   * Retrieve JWT token
   */
  async getToken(): Promise<string | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: SERVICE_NAME
      });
      return credentials ? credentials.password : null;
    } catch (err) {
      console.error("[SecureStorage] Failed to retrieve token:", err);
      return null;
    }
  },

  /**
   * Delete stored token (logout)
   */
  async clearToken(): Promise<boolean> {
    try {
      await Keychain.resetGenericPassword({ service: SERVICE_NAME });
      return true;
    } catch (err) {
      console.error("[SecureStorage] Failed to clear token:", err);
      return false;
    }
  },

  /**
   * Store biometric-protected credentials
   */
  async setBiometricCredentials(email: string, password: string): Promise<boolean> {
    try {
      await Keychain.setGenericPassword(email, password, {
        service: `${SERVICE_NAME}.biometric`,
        accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
        accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY
      });
      return true;
    } catch (err) {
      return false;
    }
  },

  /**
   * Retrieve credentials with biometric authentication
   */
  async getBiometricCredentials(): Promise<{ email: string; password: string } | null> {
    try {
      const credentials = await Keychain.getGenericPassword({
        service: `${SERVICE_NAME}.biometric`,
        authenticationPrompt: {
          title: "Authenticate",
          subtitle: "Use biometrics to sign in",
          cancel: "Cancel"
        }
      });
      if (credentials) {
        return { email: credentials.username, password: credentials.password };
      }
      return null;
    } catch (err) {
      return null;
    }
  }
};
```

### 8.2 Certificate Pinning

```typescript
// services/api/client.ts
import axios from "axios";
import { Platform } from "react-native";
import ssl from "react-native-ssl-pinning";

const API_BASE_URL = "https://api.uttag.com.tw";

// SHA256 fingerprints of server certificates
const CERTIFICATE_PINS = {
  production: [
    "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
  ]
};

// For development, use axios directly
// For production, use SSL pinning
export const createApiClient = () => {
  if (__DEV__) {
    return axios.create({
      baseURL: API_BASE_URL,
      timeout: 30000
    });
  }

  // Production: Use SSL pinning
  return {
    async get(url: string, config?: any) {
      return ssl.fetch(API_BASE_URL + url, {
        method: "GET",
        headers: config?.headers || {},
        sslPinning: {
          certs: CERTIFICATE_PINS.production
        }
      });
    },
    async post(url: string, data: any, config?: any) {
      return ssl.fetch(API_BASE_URL + url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config?.headers || {})
        },
        body: JSON.stringify(data),
        sslPinning: {
          certs: CERTIFICATE_PINS.production
        }
      });
    }
    // ... other methods
  };
};

export const api = createApiClient();
```

### 8.3 Biometric Authentication

```typescript
// hooks/useBiometric.ts
import { useState, useEffect } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { SecureStorage } from "../services/storage/secureStorage";
import { useAuthStore } from "../stores/authStore";

export function useBiometric() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState<string | null>(null);
  const { login } = useAuthStore();

  useEffect(() => {
    checkBiometricAvailability();
  }, []);

  const checkBiometricAvailability = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    setIsAvailable(compatible && enrolled);

    if (compatible) {
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("Face ID");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("Touch ID");
      }
    }

    // Check if user has enabled biometric login
    const credentials = await SecureStorage.getBiometricCredentials();
    setIsEnabled(!!credentials);
  };

  const authenticate = async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Sign in with biometrics",
        fallbackLabel: "Use password",
        disableDeviceFallback: false
      });

      if (result.success) {
        const credentials = await SecureStorage.getBiometricCredentials();
        if (credentials) {
          await login(credentials.email, credentials.password);
          return true;
        }
      }
      return false;
    } catch (err) {
      console.error("[Biometric] Authentication failed:", err);
      return false;
    }
  };

  const enableBiometric = async (email: string, password: string): Promise<boolean> => {
    const success = await SecureStorage.setBiometricCredentials(email, password);
    if (success) {
      setIsEnabled(true);
    }
    return success;
  };

  const disableBiometric = async (): Promise<boolean> => {
    // Clear biometric credentials
    // Implementation depends on keychain library
    setIsEnabled(false);
    return true;
  };

  return {
    isAvailable,
    isEnabled,
    biometricType,
    authenticate,
    enableBiometric,
    disableBiometric
  };
}
```

---

## 9. Build & Deploy

### 9.1 iOS App Store Requirements

**App Store Connect Configuration:**

| Setting | Value |
|---------|-------|
| Bundle ID | `com.uttag.mobile` |
| Minimum iOS Version | 15.0 |
| Required Capabilities | Push Notifications, Background Modes, Camera, Location |
| Privacy Permissions | NSCameraUsageDescription, NSLocationWhenInUseUsageDescription, NSLocationAlwaysUsageDescription |

**Required Certificates:**
- Apple Distribution Certificate
- Push Notification Certificate (APNs)
- Provisioning Profile (Distribution)

**Info.plist Permissions:**
```xml
<key>NSCameraUsageDescription</key>
<string>UTtag needs camera access to scan QR codes on tags</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>UTtag needs your location to show nearby tags and record delivery locations</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>UTtag needs background location to track deliveries and send geofence alerts</string>

<key>NSFaceIDUsageDescription</key>
<string>UTtag uses Face ID for quick and secure sign-in</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
  <string>remote-notification</string>
</array>
```

### 9.2 Android Play Store Requirements

**build.gradle Configuration:**
```groovy
android {
    compileSdkVersion 34

    defaultConfig {
        applicationId "com.uttag.mobile"
        minSdkVersion 26  // Android 8.0
        targetSdkVersion 34
        versionCode 1
        versionName "1.0.0"
    }

    signingConfigs {
        release {
            storeFile file(RELEASE_STORE_FILE)
            storePassword RELEASE_STORE_PASSWORD
            keyAlias RELEASE_KEY_ALIAS
            keyPassword RELEASE_KEY_PASSWORD
        }
    }
}
```

**AndroidManifest.xml Permissions:**
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.USE_BIOMETRIC" />
<uses-permission android:name="android.permission.USE_FINGERPRINT" />

<uses-feature android:name="android.hardware.camera" android:required="true" />
<uses-feature android:name="android.hardware.location.gps" android:required="false" />
```

### 9.3 CI/CD with Fastlane & EAS

**Fastlane Configuration (iOS):**

```ruby
# fastlane/Fastfile
default_platform(:ios)

platform :ios do
  desc "Build and upload to TestFlight"
  lane :beta do
    setup_ci

    match(type: "appstore", readonly: true)

    increment_build_number(
      build_number: ENV["BUILD_NUMBER"] || Time.now.strftime("%Y%m%d%H%M")
    )

    build_app(
      workspace: "UTtag.xcworkspace",
      scheme: "UTtag",
      export_method: "app-store"
    )

    upload_to_testflight(
      skip_waiting_for_build_processing: true
    )

    slack(
      message: "New iOS beta build uploaded to TestFlight!",
      channel: "#mobile-releases"
    )
  end

  desc "Deploy to App Store"
  lane :release do
    setup_ci
    match(type: "appstore", readonly: true)

    build_app(
      workspace: "UTtag.xcworkspace",
      scheme: "UTtag",
      export_method: "app-store"
    )

    upload_to_app_store(
      submit_for_review: true,
      automatic_release: true,
      force: true,
      precheck_include_in_app_purchases: false
    )
  end
end
```

**GitHub Actions Workflow:**

```yaml
# .github/workflows/mobile-release.yml
name: Mobile App Release

on:
  push:
    tags:
      - 'mobile-v*'

jobs:
  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - name: Install dependencies
        run: |
          cd mobile
          yarn install --frozen-lockfile

      - name: Install pods
        run: |
          cd mobile/ios
          pod install

      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.2'
          bundler-cache: true

      - name: Install Fastlane
        run: |
          cd mobile
          bundle install

      - name: Build and upload to TestFlight
        env:
          MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
          FASTLANE_USER: ${{ secrets.APPLE_ID }}
          FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD: ${{ secrets.APPLE_ASP }}
          BUILD_NUMBER: ${{ github.run_number }}
        run: |
          cd mobile
          bundle exec fastlane ios beta

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'

      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Install dependencies
        run: |
          cd mobile
          yarn install --frozen-lockfile

      - name: Decode Keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > mobile/android/app/release.keystore

      - name: Build Release APK
        env:
          RELEASE_STORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          RELEASE_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          cd mobile/android
          ./gradlew assembleRelease

      - name: Upload to Play Store (Internal)
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: com.uttag.mobile
          releaseFiles: mobile/android/app/build/outputs/apk/release/app-release.apk
          track: internal
```

**EAS Build Configuration (eas.json):**

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      },
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "ios": {
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "developer@uttag.com.tw",
        "ascAppId": "1234567890",
        "appleTeamId": "XXXXXXXXXX"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "production"
      }
    }
  }
}
```

---

## Appendix

### A. Environment Variables

```bash
# .env.production
API_BASE_URL=https://api.uttag.com.tw
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# Firebase
FIREBASE_PROJECT_ID=uttag-mobile
FIREBASE_API_KEY=your-api-key

# Mapbox
MAPBOX_ACCESS_TOKEN=pk.your-mapbox-token

# Sentry
SENTRY_DSN=https://xxx@sentry.io/xxx
```

### B. Dependencies (package.json)

```json
{
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.73.x",
    "@react-navigation/native": "^6.x",
    "@react-navigation/bottom-tabs": "^6.x",
    "@react-navigation/stack": "^6.x",

    "zustand": "^4.x",
    "@tanstack/react-query": "^5.x",
    "axios": "^1.x",

    "@nozbe/watermelondb": "^0.27.x",
    "react-native-keychain": "^8.x",

    "react-native-vision-camera": "^3.x",
    "react-native-maps": "^1.x",
    "@rnmapbox/maps": "^10.x",

    "@react-native-firebase/app": "^18.x",
    "@react-native-firebase/messaging": "^18.x",

    "expo-local-authentication": "^13.x",
    "@react-native-community/netinfo": "^11.x",
    "react-native-background-fetch": "^4.x",

    "victory-native": "^37.x",
    "react-native-svg": "^14.x",

    "@sentry/react-native": "^5.x"
  }
}
```

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-18 | SA Agent | Initial technical specification |

---

*This document provides the technical foundation for implementing the UTtag Mobile App (Phase 4). Implementation should follow this specification while adapting to any requirements changes discovered during development.*
