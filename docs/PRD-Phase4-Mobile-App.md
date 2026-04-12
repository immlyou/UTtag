# Product Requirements Document (PRD)
# Phase 4: Mobile App Planning (行動裝置 App 規劃)

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
6. [Technology Recommendations](#6-technology-recommendations)
7. [UI/UX Considerations](#7-uiux-considerations)
8. [System Architecture](#8-system-architecture)
9. [Integration Points](#9-integration-points)
10. [Offline Mode Design](#10-offline-mode-design)
11. [Push Notification Strategy](#11-push-notification-strategy)
12. [Success Metrics](#12-success-metrics)
13. [Out of Scope](#13-out-of-scope)
14. [Timeline & Milestones](#14-timeline--milestones)
15. [Dependencies & Risks](#15-dependencies--risks)
16. [Appendix](#appendix)

---

## 1. Executive Summary

### Overview
Phase 4 introduces a native mobile application (iOS & Android) for the UTtag cold chain logistics platform. The mobile app provides field workers, drivers, supervisors, and warehouse personnel with real-time access to tag tracking, alerts, and task management while on the move. This extends the existing web dashboard capabilities to mobile-first workflows optimized for field operations.

### Business Value
- **Field Mobility:** Enable real-time operations without desktop access
- **Faster Response:** Reduce alert response time by 60% with push notifications
- **Offline Capability:** Maintain productivity in areas with poor connectivity
- **Task Efficiency:** Streamline delivery workflows with scanning and navigation
- **Compliance:** Capture proof of delivery and temperature readings on-site

### Target Users

| User Role | Primary Use Cases | Priority |
|-----------|-------------------|----------|
| **Field Worker (外勤人員)** | Scan tags, check status, complete tasks | P0 |
| **Driver (司機)** | Navigation, delivery confirmation, alerts | P0 |
| **Supervisor (主管)** | Real-time monitoring, alert management | P0 |
| **Warehouse Worker (倉管人員)** | Goods receipt, dispatch confirmation | P1 |
| **Quality Inspector (品管人員)** | Temperature checks, exception handling | P1 |

### Relationship to Existing System
The UTtag platform currently provides:
- Web-based dashboard for tag monitoring
- Real-time chat system (Phase 1)
- Report scheduling and automation (Phase 2)
- Multi-tenant management (Phase 3)
- REST APIs for data access
- WebSocket for real-time updates (Supabase Realtime)

Phase 4 extends these capabilities to mobile with:
- Native app experience optimized for one-hand operation
- Push notifications for critical alerts
- QR/barcode scanning for quick tag lookup
- Offline mode with data synchronization
- Navigation integration for delivery routing

---

## 2. Problem Statement

### Current Situation
Field workers and drivers currently rely on the web dashboard accessed via mobile browsers, which presents several challenges:

1. **No Mobile Optimization:** Web dashboard requires horizontal scrolling and zooming
2. **No Push Notifications:** Critical alerts missed when browser is closed
3. **No Offline Access:** Operations halt in areas with poor connectivity
4. **Manual Tag Lookup:** Must type MAC addresses; no barcode scanning
5. **No Navigation Integration:** Switch between apps for routing
6. **Battery Drain:** Browser-based access consumes more power

### Pain Points

| Pain Point | Impact | Severity | Affected Users |
|------------|--------|----------|----------------|
| Miss critical temperature alerts while driving | Spoiled goods, regulatory violations | Critical | Drivers, Supervisors |
| Cannot access tag status in warehouse dead zones | Workflow delays, manual paper records | High | Warehouse Workers |
| Slow tag lookup by typing MAC address | 30+ seconds per lookup | High | Field Workers |
| No proof of delivery capture | Disputes, compliance gaps | High | Drivers |
| Switching between maps and dashboard | Distracted driving risk | Medium | Drivers |
| Web app drains battery quickly | End-of-shift power issues | Medium | All Field Users |

### User Quotes
> "I'm driving for 8 hours. If there's a temperature alert, I need to know immediately - not when I check my browser." - Delivery Driver

> "In the warehouse freezer, there's no WiFi. I write down readings on paper and enter them later. It's error-prone." - Warehouse Supervisor

> "Typing AA:BB:CC:DD:EE:FF on a phone keyboard takes forever. I need to scan the tag barcode." - Field Technician

> "When I arrive at delivery, I take a photo with my camera app, then send it via LINE. There's no integration." - Logistics Coordinator

### Market Context

**Competitor Analysis:**

| Competitor | Mobile App | Offline Mode | QR Scan | Push Alerts |
|------------|------------|--------------|---------|-------------|
| Sensitech | Yes | Partial | Yes | Yes |
| Tive | Yes | Yes | Yes | Yes |
| Emerson GO | Yes | Yes | Yes | Yes |
| **UTtag (Current)** | **No** | **No** | **No** | **No** |

The lack of a mobile app is a competitive disadvantage that Phase 4 addresses.

---

## 3. Goals & Objectives

### Primary Goals
1. **Enable Mobile-First Field Operations:** Primary workflow for field workers
2. **Ensure Critical Alert Delivery:** Push notifications with <30 second latency
3. **Support Offline Workflows:** Core features available without connectivity
4. **Reduce Tag Lookup Time:** From 30+ seconds to <3 seconds via scanning
5. **Streamline Delivery Process:** End-to-end workflow in single app

### Success Criteria

| Metric | Target | Measurement |
|--------|--------|-------------|
| App Store Rating | >= 4.0 stars | App Store/Play Store |
| Daily Active Users (DAU) | 70% of field workforce | Analytics |
| Alert Response Time | 60% reduction | Comparative before/after |
| Task Completion via Mobile | 80% of field tasks | Task logs |
| Offline Sync Success Rate | 99%+ | Sync error logs |
| Tag Lookup Time | <3 seconds via scan | UX testing |
| Battery Consumption | <15% per 8-hour shift | Device testing |
| Crash-Free Sessions | 99.5%+ | Crashlytics |

### Non-Goals (This Phase)
- Replace web dashboard for admin functions
- Support tablets as primary device (phones first)
- Custom hardware integration (Bluetooth beacons Phase 4c)
- White-label app per tenant (future consideration)
- Wearable support (smartwatch - future)

---

## 4. User Stories

### Epic 1: Real-Time Tag Monitoring

#### US-4.1: View Tag Map on Mobile
**As a** supervisor
**I want to** view all tags on a mobile map
**So that** I can monitor fleet positions while away from my desk

**Acceptance Criteria:**
- [ ] Map displays all tags within my tenant scope
- [ ] Tags show colored icons based on status (normal, alert, offline)
- [ ] Map clusters tags when zoomed out (300+ tags)
- [ ] Tap tag icon to view quick summary
- [ ] Current location shown on map (with permission)
- [ ] Map performance smooth at 60fps with 500+ markers
- [ ] Last update timestamp visible

**Wireframe:**
```
┌─────────────────────────────────┐
│ ← UTtag                    ⚙️ 🔔│
├─────────────────────────────────┤
│                                 │
│     [═══════════════════]       │
│     [     MAP VIEW      ]       │
│     [    with markers   ]       │
│     [  📍 📍    📍      ]       │
│     [      📍    📍📍   ]       │
│     [═══════════════════]       │
│                                 │
├─────────────────────────────────┤
│ 🔍 Search tags...               │
├─────────────────────────────────┤
│ [地圖] [列表] [掃描] [任務]     │
└─────────────────────────────────┘
```

#### US-4.2: View Tag Details
**As a** field worker
**I want to** view detailed tag information
**So that** I can verify temperature and location status

**Acceptance Criteria:**
- [ ] Displays: Tag name, MAC, temperature, humidity, battery
- [ ] Shows location on mini-map
- [ ] Temperature trend chart (last 24h)
- [ ] Alert history for this tag
- [ ] Last update timestamp
- [ ] Status indicators (online/offline, normal/alert)
- [ ] Actions: Navigate to tag, View history, Create alert

**Wireframe:**
```
┌─────────────────────────────────┐
│ ← COLD-TRUCK-001           ⋮   │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │      [Mini Map]            │ │
│ │        📍                   │ │
│ └─────────────────────────────┘ │
│                                 │
│  🌡️ Temperature    -2.3°C ✓    │
│  💧 Humidity       65% RH ✓    │
│  🔋 Battery        87%         │
│  📍 Location       台北市中山區│
│  ⏰ Last Update    2 分鐘前    │
│                                 │
│  ┌─────────────────────────────┐│
│  │ Temperature (24h)          ││
│  │  ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁          ││
│  │  -5°C ───────────── 0°C    ││
│  └─────────────────────────────┘│
│                                 │
│  [ 🧭 導航 ]  [ 📋 歷史 ]       │
└─────────────────────────────────┘
```

#### US-4.3: Filter and Search Tags
**As a** supervisor
**I want to** filter tags by status and search by name
**So that** I can quickly find specific tags or problem areas

**Acceptance Criteria:**
- [ ] Search by tag name, MAC address, or label
- [ ] Filter by status: All, Normal, Alert, Offline
- [ ] Filter by temperature range
- [ ] Filter by geofence/zone
- [ ] Results update in real-time
- [ ] Recent searches remembered

---

### Epic 2: QR Code Scanning

#### US-4.4: Scan Tag QR Code
**As a** field worker
**I want to** scan a tag's QR code to view its status
**So that** I can quickly identify and check any tag

**Acceptance Criteria:**
- [ ] Camera opens with QR scanner overlay
- [ ] Supports QR codes and barcodes (CODE128)
- [ ] Scans successfully in low light (warehouse)
- [ ] Immediate redirect to tag detail view
- [ ] Audio/haptic feedback on successful scan
- [ ] Manual MAC entry fallback option
- [ ] Scan history for recent lookups

**Wireframe:**
```
┌─────────────────────────────────┐
│ ← 掃描標籤                      │
├─────────────────────────────────┤
│                                 │
│  ┌─────────────────────────────┐│
│  │                             ││
│  │   ┌───────────────────┐     ││
│  │   │                   │     ││
│  │   │   [ QR Scanner ]  │     ││
│  │   │   [   Frame    ]  │     ││
│  │   │                   │     ││
│  │   └───────────────────┘     ││
│  │                             ││
│  │   將 QR Code 置於框內        ││
│  │                             ││
│  └─────────────────────────────┘│
│                                 │
│  💡 開啟閃光燈                   │
│                                 │
│  [手動輸入 MAC 地址]            │
│                                 │
│  最近掃描:                      │
│  • COLD-TRUCK-001  2分鐘前     │
│  • FREEZER-A-003   15分鐘前    │
└─────────────────────────────────┘
```

#### US-4.5: Batch Scan for Inventory
**As a** warehouse worker
**I want to** scan multiple tags in sequence
**So that** I can quickly process incoming/outgoing shipments

**Acceptance Criteria:**
- [ ] Continuous scan mode (scan multiple without leaving camera)
- [ ] Count display: "已掃描: 15/20 件"
- [ ] List of scanned items with status
- [ ] Duplicate scan warning
- [ ] Export scan session to report
- [ ] Associate scans with task/shipment

---

### Epic 3: Push Notifications

#### US-4.6: Receive Critical Alerts
**As a** driver
**I want to** receive push notifications for critical alerts
**So that** I can respond immediately to temperature issues

**Acceptance Criteria:**
- [ ] Push notification for temperature excursion
- [ ] Push notification for SOS/panic button
- [ ] Push notification for geofence breach
- [ ] Push notification for battery low (<20%)
- [ ] Notification shows tag name, alert type, value
- [ ] Tap notification opens relevant tag detail
- [ ] Critical alerts bypass Do Not Disturb (Android)
- [ ] Notification settings configurable per alert type

**Notification Types:**

| Alert Type | Priority | Sound | Vibration |
|------------|----------|-------|-----------|
| SOS/Panic | Critical | Loud alarm | Long pattern |
| Temperature Excursion | High | Alert tone | Double pulse |
| Geofence Breach | Medium | Notification | Single pulse |
| Battery Low | Low | Soft tone | None |
| Tag Offline (>1hr) | Low | Soft tone | None |

**Wireframe (Notification):**
```
┌─────────────────────────────────┐
│ 🔴 UTtag 緊急警報               │
│ ──────────────────────────────  │
│ 🌡️ 溫度異常: COLD-TRUCK-001    │
│ 目前溫度: 12.3°C (上限: 8°C)   │
│ 位置: 台北市中山區              │
│                                 │
│ [查看詳情]      [導航至此]      │
└─────────────────────────────────┘
```

#### US-4.7: Configure Notification Preferences
**As a** user
**I want to** configure which alerts I receive and how
**So that** I can manage notification volume without missing critical alerts

**Acceptance Criteria:**
- [ ] Toggle each alert type on/off
- [ ] Set quiet hours (except critical)
- [ ] Choose notification sound
- [ ] Configure vibration pattern
- [ ] Filter notifications by assigned tags only
- [ ] Sync preferences with web dashboard

---

### Epic 4: Task Management

#### US-4.8: View Task List
**As a** field worker
**I want to** view my assigned tasks
**So that** I can plan my work for the day

**Acceptance Criteria:**
- [ ] List of assigned tasks sorted by priority/due time
- [ ] Task status indicators (pending, in progress, completed)
- [ ] Task details: location, description, associated tags
- [ ] Overdue tasks highlighted
- [ ] Pull-to-refresh
- [ ] Filter by status, date range

**Wireframe:**
```
┌─────────────────────────────────┐
│ 我的任務                   + 🔔 │
├─────────────────────────────────┤
│ 今日 (5)     本週 (12)    全部  │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ ⚠️ 送貨至大潤發中山店       │ │
│ │ 📍 台北市中山區...          │ │
│ │ ⏰ 14:00 前完成   逾期 30分  │ │
│ │ 🏷️ 3 個標籤                 │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 🔵 收貨確認 - 冷凍倉 A      │ │
│ │ 📍 公司倉庫                  │ │
│ │ ⏰ 16:00 前完成              │ │
│ │ 🏷️ 8 個標籤                 │ │
│ └─────────────────────────────┘ │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ ✓ 設備巡檢 - 冷藏車隊       │ │
│ │ 已完成 09:45                │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ [地圖] [列表] [掃描] [任務]     │
└─────────────────────────────────┘
```

#### US-4.9: Complete Task with Checklist
**As a** field worker
**I want to** mark tasks as complete with required checks
**So that** I can document task completion properly

**Acceptance Criteria:**
- [ ] Task checklist items (e.g., verify temperature, take photo)
- [ ] Required vs optional checklist items
- [ ] Photo capture within task flow
- [ ] GPS timestamp on completion
- [ ] Notes/comments field
- [ ] Signature capture (for delivery)
- [ ] Offline completion with later sync

#### US-4.10: Create Ad-hoc Task
**As a** supervisor
**I want to** create tasks and assign to team members
**So that** I can respond to issues discovered in the field

**Acceptance Criteria:**
- [ ] Create task with title, description, location
- [ ] Assign to team member
- [ ] Set priority and due time
- [ ] Associate with specific tags
- [ ] Send push notification to assignee
- [ ] Task appears in assignee's list immediately

---

### Epic 5: Navigation Integration

#### US-4.11: Navigate to Tag Location
**As a** driver
**I want to** get turn-by-turn directions to a tag's location
**So that** I can respond to alerts or complete deliveries efficiently

**Acceptance Criteria:**
- [ ] One-tap navigation to tag's last known location
- [ ] Choice of navigation app (Google Maps, Apple Maps, Waze)
- [ ] In-app navigation option (using Mapbox)
- [ ] ETA display before starting navigation
- [ ] Save frequent destinations

#### US-4.12: Route Optimization
**As a** driver with multiple deliveries
**I want to** get an optimized route for all my tasks
**So that** I can minimize driving time

**Acceptance Criteria:**
- [ ] View all task locations on map
- [ ] Calculate optimized route order
- [ ] Display total distance and estimated time
- [ ] Start navigation through optimized sequence
- [ ] Adjust route manually if needed

---

### Epic 6: Delivery Proof Capture

#### US-4.13: Capture Proof of Delivery
**As a** driver
**I want to** capture photos and signatures for delivery proof
**So that** I can document successful deliveries

**Acceptance Criteria:**
- [ ] Photo capture with timestamp watermark
- [ ] GPS coordinates embedded in photo metadata
- [ ] Multiple photos per delivery
- [ ] Recipient signature capture
- [ ] Associate with specific tags/shipment
- [ ] Offline capture with later sync

**Wireframe:**
```
┌─────────────────────────────────┐
│ ← 送貨確認                      │
├─────────────────────────────────┤
│ 大潤發中山店                    │
│ 訂單編號: ORD-2026031801        │
│                                 │
│ 確認項目:                       │
│ ☑ 已確認貨品數量 (3件)          │
│ ☑ 已確認溫度正常               │
│ ☐ 已拍攝送達照片               │
│ ☐ 已取得收貨簽名               │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ 📷 點擊拍攝送達照片          │ │
│ │     [Camera Preview]        │ │
│ └─────────────────────────────┘ │
│                                 │
│ 收貨人簽名:                     │
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │   [Signature Pad]           │ │
│ │                             │ │
│ └─────────────────────────────┘ │
│                                 │
│ [      確認送達完成      ]      │
└─────────────────────────────────┘
```

---

### Epic 7: Goods Receipt/Dispatch

#### US-4.14: Receive Goods with Verification
**As a** warehouse worker
**I want to** scan incoming shipments and verify temperature
**So that** I can document proper goods receipt

**Acceptance Criteria:**
- [ ] Scan multiple tags in batch mode
- [ ] Display temperature status for each scanned tag
- [ ] Flag any tags with temperature excursion during transit
- [ ] Capture receiving notes
- [ ] Generate receipt confirmation report
- [ ] Associate with purchase order/ASN

#### US-4.15: Dispatch Goods with Assignment
**As a** warehouse worker
**I want to** scan outgoing goods and assign to delivery
**So that** I can track shipments from warehouse to customer

**Acceptance Criteria:**
- [ ] Scan tags to add to dispatch list
- [ ] Assign dispatch to driver/vehicle
- [ ] Link to delivery task
- [ ] Print/share dispatch manifest
- [ ] Start tracking from dispatch moment

---

## 5. Feature Scope

### MVP (Must Have) - Phase 4a (8-10 weeks)

| Feature | Description | User Stories | Priority |
|---------|-------------|--------------|----------|
| **Authentication** | Login, biometric auth, session management | - | P0 |
| **Tag Map View** | Real-time map with tag markers | US-4.1 | P0 |
| **Tag Detail View** | Temperature, location, battery, history | US-4.2 | P0 |
| **Tag Search/Filter** | Search by name/MAC, filter by status | US-4.3 | P0 |
| **QR Code Scanner** | Single tag scan and lookup | US-4.4 | P0 |
| **Push Notifications** | Critical alerts (SOS, temp, geofence) | US-4.6 | P0 |
| **Task List** | View assigned tasks | US-4.8 | P0 |
| **Task Completion** | Mark complete with basic checklist | US-4.9 | P0 |
| **Basic Navigation** | Open in external maps app | US-4.11 | P0 |

### Phase 4b (4-6 weeks)

| Feature | Description | User Stories | Priority |
|---------|-------------|--------------|----------|
| **Offline Mode** | Core features without connectivity | US-4.17 | P1 |
| **Data Sync** | Background sync with conflict resolution | - | P1 |
| **Batch Scanning** | Scan multiple tags in sequence | US-4.5 | P1 |
| **In-App Navigation** | Mapbox-based navigation | US-4.11 | P1 |
| **Route Optimization** | Multi-stop route planning | US-4.12 | P1 |
| **Photo Capture** | Proof of delivery photos | US-4.13 | P1 |
| **Signature Capture** | Digital signature collection | US-4.13 | P1 |
| **Voice Notes** | Audio recording for field notes | - | P1 |
| **Notification Settings** | Configure alert preferences | US-4.7 | P1 |

### Phase 4c (4 weeks)

| Feature | Description | User Stories | Priority |
|---------|-------------|--------------|----------|
| **Bluetooth Tag Pairing** | Direct BLE connection to tags | US-4.18 | P2 |
| **AR Tag Finder** | Camera-based tag location | US-4.19 | P2 |
| **Team Chat Integration** | Phase 1 chat in mobile app | US-4.20 | P2 |
| **Goods Receipt** | Warehouse receiving workflow | US-4.14 | P2 |
| **Goods Dispatch** | Warehouse dispatch workflow | US-4.15 | P2 |
| **Create Task** | Ad-hoc task creation | US-4.10 | P2 |

### Feature Dependency Graph

```
                    ┌───────────────┐
                    │ Authentication│
                    └───────┬───────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
            ▼               ▼               ▼
    ┌───────────────┐ ┌───────────┐ ┌───────────────┐
    │   Tag Map     │ │Push Notify│ │  Task List    │
    └───────┬───────┘ └───────────┘ └───────┬───────┘
            │                               │
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │  Tag Detail   │               │Task Completion│
    └───────┬───────┘               └───────┬───────┘
            │                               │
            ▼                               ▼
    ┌───────────────┐               ┌───────────────┐
    │  QR Scanner   │               │ Photo Capture │
    └───────────────┘               └───────────────┘
            │                               │
            └───────────────┬───────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │ Offline Mode  │
                    └───────────────┘
```

---

## 6. Technology Recommendations

### Framework Comparison

| Criteria | React Native | Flutter | PWA |
|----------|-------------|---------|-----|
| **Development Speed** | Fast (JS/TS team) | Medium (Dart learning) | Fastest |
| **Native Performance** | Good | Excellent | Limited |
| **Offline Support** | Good (AsyncStorage) | Excellent (Hive) | Limited (Service Workers) |
| **Push Notifications** | Good | Good | Limited (iOS) |
| **Camera/Scanning** | Good (react-native-camera) | Excellent | Limited |
| **Maps Integration** | Excellent (react-native-maps) | Good | Good (Web APIs) |
| **App Store Presence** | Yes | Yes | Partial |
| **Code Sharing** | 90%+ iOS/Android | 95%+ iOS/Android | 100% |
| **Team Familiarity** | High (JS stack) | Low | High |
| **Long-term Maintenance** | Good | Good | Excellent |

### Recommendation: React Native

**Rationale:**
1. **Team Alignment:** Existing team uses JavaScript/TypeScript (Express, Vanilla JS)
2. **Shared Logic:** Can reuse validation, API clients, data models from web
3. **Ecosystem:** Mature libraries for camera, maps, push notifications
4. **Time to Market:** Faster initial development with familiar stack
5. **Native Features:** Full access to camera, Bluetooth, background tasks

**Alternative Consideration: Flutter**
If performance for 500+ map markers becomes critical, Flutter's Skia rendering engine may provide smoother animations. Recommend prototyping map view in both frameworks during technical discovery.

### Technology Stack

#### Frontend (React Native)

| Component | Technology | Version | Notes |
|-----------|------------|---------|-------|
| **Framework** | React Native | 0.73+ | Latest stable |
| **Language** | TypeScript | 5.0+ | Type safety |
| **State Management** | Zustand | 4.x | Lightweight, hooks-based |
| **Navigation** | React Navigation | 6.x | Native navigation |
| **Maps** | react-native-maps + Mapbox | - | Mapbox for custom styling |
| **Camera/QR** | react-native-vision-camera | 3.x | Best performance |
| **Push Notifications** | Firebase Cloud Messaging | - | Cross-platform |
| **Offline Storage** | WatermelonDB | 0.27+ | SQLite-based, reactive |
| **API Client** | Axios + React Query | - | Caching, retry, offline |
| **Forms** | React Hook Form | 7.x | Performance |
| **Charts** | Victory Native | - | For temperature graphs |

#### Backend (Existing + Additions)

| Component | Technology | Notes |
|-----------|------------|-------|
| **API Server** | Express.js | Existing |
| **Database** | Supabase PostgreSQL | Existing |
| **Real-time** | Supabase Realtime | Existing WebSocket |
| **Push Service** | Firebase Cloud Messaging (FCM) | New |
| **File Storage** | Supabase Storage | For photos |
| **CDN** | Cloudflare | For static assets |

#### Infrastructure

| Component | Technology | Notes |
|-----------|------------|-------|
| **CI/CD** | GitHub Actions + Fastlane | Automated builds |
| **App Distribution** | App Store, Google Play | Production |
| **Beta Testing** | TestFlight, Firebase App Distribution | Pre-release |
| **Crash Reporting** | Sentry | Error tracking |
| **Analytics** | Mixpanel or Amplitude | User behavior |
| **Performance** | Firebase Performance | Mobile metrics |

### Maps Provider Comparison

| Provider | Cost | Offline Maps | Custom Styling | Navigation |
|----------|------|--------------|----------------|------------|
| Google Maps | $7/1K sessions | No (paid add-on) | Limited | Google SDK |
| Mapbox | Free to 25K MAU | Yes (included) | Full | Mapbox Nav |
| Apple Maps | Free | iOS only | Limited | Apple Maps |

**Recommendation: Mapbox**
- Free tier sufficient for initial launch
- Offline map downloads included
- Full styling control for brand consistency
- Turn-by-turn navigation SDK available
- Works on both iOS and Android

### Offline Storage Strategy

**WatermelonDB Benefits:**
- Lazy-loaded: Only fetches what's needed
- Optimized for React Native performance
- SQLite under the hood (reliable)
- Built-in sync support
- Observable queries (reactive)

**Schema Example:**
```javascript
// schema.js
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export default appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'tags',
      columns: [
        { name: 'mac', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'temperature', type: 'number', isOptional: true },
        { name: 'humidity', type: 'number', isOptional: true },
        { name: 'battery', type: 'number', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'last_seen_at', type: 'number' },
        { name: 'synced_at', type: 'number' },
        { name: 'is_pending_sync', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'tasks',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'due_at', type: 'number', isOptional: true },
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
        { name: 'synced_at', type: 'number' },
        { name: 'is_pending_sync', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: 'scan_history',
      columns: [
        { name: 'mac', type: 'string', isIndexed: true },
        { name: 'scanned_at', type: 'number' },
        { name: 'latitude', type: 'number', isOptional: true },
        { name: 'longitude', type: 'number', isOptional: true },
      ],
    }),
  ],
})
```

---

## 7. UI/UX Considerations

### Design Principles

#### 1. One-Hand Operation
- Primary actions in bottom half of screen (thumb zone)
- Bottom navigation bar for core features
- Swipe gestures for common actions
- Floating action button for quick scan

#### 2. Large Touch Targets
- Minimum 48dp touch targets (Android guidelines)
- Minimum 44pt touch targets (iOS HIG)
- Generous spacing between interactive elements
- Larger fonts for outdoor visibility (16sp minimum)

#### 3. Glanceable Information
- Status at a glance with color coding
- Numbers large and prominent
- Icons consistent with web dashboard
- Critical alerts visually distinct

#### 4. Minimal Data Entry
- Scan over type whenever possible
- Smart defaults
- Auto-complete for common inputs
- Voice input option

#### 5. Dark Mode for Low-Light
- Full dark mode support
- High contrast mode option
- Reduced blue light in night mode
- Legible in bright sunlight

### Thumb Zone Layout

```
┌─────────────────────────────────┐
│                                 │
│         Hard to reach           │
│              Zone               │
│         (Status, info)          │
│                                 │
├─────────────────────────────────┤
│                                 │
│         Natural                 │
│         stretch Zone            │
│     (Secondary actions)         │
│                                 │
├─────────────────────────────────┤
│                                 │
│         Easy reach              │
│         Thumb Zone              │
│    (Primary actions, nav)       │
│                                 │
│    [ 地圖 ] [ 掃描 ] [ 任務 ]    │
└─────────────────────────────────┘
```

### Color System

| Color | Hex | Usage |
|-------|-----|-------|
| Primary | #2563EB | Buttons, links, active states |
| Success | #10B981 | Normal status, success messages |
| Warning | #F59E0B | Warnings, attention required |
| Danger | #EF4444 | Alerts, errors, critical status |
| Neutral | #6B7280 | Text, borders, disabled states |
| Background (Light) | #F9FAFB | App background |
| Background (Dark) | #111827 | Dark mode background |

### Status Indicators

| Status | Color | Icon | Label |
|--------|-------|------|-------|
| Online/Normal | Green | ✓ | 正常 |
| Offline (<1hr) | Yellow | ○ | 離線 |
| Offline (>1hr) | Gray | ○ | 長時間離線 |
| Temperature Alert | Red | ⚠️ | 溫度異常 |
| SOS/Emergency | Red (pulsing) | 🆘 | 緊急 |
| Battery Low | Orange | 🔋 | 電量低 |
| Geofence Alert | Orange | 📍 | 圍欄警報 |

### Typography

| Element | iOS | Android | Size |
|---------|-----|---------|------|
| H1 / Page Title | SF Pro Display | Roboto | 28sp |
| H2 / Section | SF Pro Display | Roboto | 22sp |
| Body | SF Pro Text | Roboto | 16sp |
| Caption | SF Pro Text | Roboto | 14sp |
| Button | SF Pro Text | Roboto Medium | 16sp |
| Tab Label | SF Pro Text | Roboto Medium | 12sp |

### Accessibility

- VoiceOver (iOS) and TalkBack (Android) support
- Minimum contrast ratio 4.5:1
- Support for system font scaling
- Motion-reduced mode (disable animations)
- Haptic feedback for important actions
- Screen reader labels for all interactive elements

---

## 8. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Mobile Application                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │   React     │  │   Zustand   │  │  WatermelonDB │  │  FCM Client       │ │
│  │   Native    │  │   Store     │  │  (SQLite)    │  │  (Push Receiver)  │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  └─────────┬─────────┘ │
│         │                │                │                     │           │
│         └────────────────┼────────────────┼─────────────────────┘           │
│                          │                │                                  │
│                   ┌──────┴───────┐  ┌─────┴──────┐                          │
│                   │  API Client  │  │Sync Service│                          │
│                   │  (Axios/RQ)  │  │            │                          │
│                   └──────┬───────┘  └─────┬──────┘                          │
└──────────────────────────┼────────────────┼──────────────────────────────────┘
                           │                │
                    ┌──────┴────────────────┴──────┐
                    │         HTTPS / WSS          │
                    └──────────────┬───────────────┘
                                   │
┌──────────────────────────────────┼───────────────────────────────────────────┐
│                           Backend (Express.js)                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐ │
│  │  REST API     │  │  WebSocket    │  │  FCM Server   │  │  Sync API     │ │
│  │  /api/v1/*    │  │  (Realtime)   │  │  (Push Send)  │  │  /api/sync/*  │ │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘ │
│          │                  │                  │                  │         │
│          └──────────────────┼──────────────────┼──────────────────┘         │
│                             │                  │                             │
│                      ┌──────┴──────┐    ┌──────┴──────┐                      │
│                      │  Supabase   │    │   Firebase  │                      │
│                      │  PostgreSQL │    │    FCM      │                      │
│                      │  Realtime   │    │             │                      │
│                      │  Storage    │    │             │                      │
│                      └─────────────┘    └─────────────┘                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
src/
├── app/                    # App entry, navigation
│   ├── App.tsx
│   ├── Navigation.tsx
│   └── screens/
│       ├── MapScreen.tsx
│       ├── TagDetailScreen.tsx
│       ├── ScanScreen.tsx
│       ├── TaskListScreen.tsx
│       ├── TaskDetailScreen.tsx
│       ├── SettingsScreen.tsx
│       └── LoginScreen.tsx
│
├── components/             # Reusable UI components
│   ├── common/
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   └── Modal.tsx
│   ├── tag/
│   │   ├── TagMarker.tsx
│   │   ├── TagCard.tsx
│   │   ├── TagStatusBadge.tsx
│   │   └── TemperatureChart.tsx
│   ├── task/
│   │   ├── TaskCard.tsx
│   │   ├── TaskChecklist.tsx
│   │   └── SignatureCapture.tsx
│   └── scanner/
│       ├── QRScanner.tsx
│       └── BatchScanList.tsx
│
├── stores/                 # Zustand stores
│   ├── authStore.ts
│   ├── tagStore.ts
│   ├── taskStore.ts
│   ├── notificationStore.ts
│   └── settingsStore.ts
│
├── database/               # WatermelonDB
│   ├── schema.ts
│   ├── models/
│   │   ├── Tag.ts
│   │   ├── Task.ts
│   │   └── ScanHistory.ts
│   └── sync/
│       ├── syncTags.ts
│       ├── syncTasks.ts
│       └── conflictResolver.ts
│
├── services/               # External services
│   ├── api/
│   │   ├── client.ts
│   │   ├── tags.ts
│   │   ├── tasks.ts
│   │   └── auth.ts
│   ├── push/
│   │   ├── fcmService.ts
│   │   └── notificationHandler.ts
│   ├── location/
│   │   └── locationService.ts
│   └── storage/
│       └── photoService.ts
│
├── hooks/                  # Custom hooks
│   ├── useTag.ts
│   ├── useTasks.ts
│   ├── useSync.ts
│   ├── useCamera.ts
│   └── useLocation.ts
│
├── utils/                  # Utilities
│   ├── date.ts
│   ├── format.ts
│   ├── validation.ts
│   └── constants.ts
│
└── theme/                  # Design system
    ├── colors.ts
    ├── typography.ts
    ├── spacing.ts
    └── index.ts
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            User Interaction                              │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          React Native Screen                             │
│                                                                          │
│  1. User taps "Refresh"                                                  │
│  2. Screen dispatches action to store                                    │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Zustand Store                                  │
│                                                                          │
│  1. Sets loading state                                                   │
│  2. Calls API service                                                    │
│  3. Updates local DB via sync service                                    │
│  4. Updates UI state                                                     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
            ▼                       ▼                       ▼
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│    API Service      │  │  WatermelonDB       │  │   UI Update         │
│                     │  │  (Local Cache)      │  │   (Re-render)       │
│  • HTTP request     │  │  • Write to SQLite  │  │  • Show new data    │
│  • Handle response  │  │  • Observable query │  │  • Hide loading     │
└──────────┬──────────┘  └─────────────────────┘  └─────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Backend API                                     │
│                                                                          │
│  • Authenticate request                                                  │
│  • Query Supabase                                                        │
│  • Return JSON response                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Integration Points

### Existing REST APIs

The mobile app integrates with existing UTtag APIs:

| Endpoint | Method | Description | Mobile Usage |
|----------|--------|-------------|--------------|
| `/api/auth/login` | POST | Admin authentication | Login flow |
| `/api/tenant/auth/login` | POST | Tenant user auth | Login flow |
| `/api/sensors/latest` | GET | Latest sensor data | Tag list/map |
| `/api/sensors/history` | GET | Historical data | Tag detail charts |
| `/api/clients/tags` | GET | Client's bound tags | Tag list |
| `/api/tenant/devices` | GET | Tenant devices | Tag list |
| `/api/b2b/tags` | GET | B2B tag access | Third-party integration |

### New Mobile APIs Required

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mobile/sync` | POST | Batch sync endpoint |
| `/api/mobile/push/register` | POST | Register FCM token |
| `/api/mobile/push/preferences` | PUT | Update notification settings |
| `/api/tasks` | CRUD | Task management |
| `/api/tasks/:id/complete` | POST | Complete task with data |
| `/api/delivery/proof` | POST | Upload delivery proof |
| `/api/scans` | POST | Log scan events |

### WebSocket Integration

**Supabase Realtime for:**
- Tag status updates
- Alert broadcasts
- Task assignments
- Chat messages (Phase 1 integration)

```javascript
// Example: Subscribe to tag updates
const channel = supabase
  .channel('tag-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'sensor_data',
      filter: `mac=in.(${userTagMacs.join(',')})`,
    },
    (payload) => {
      handleTagUpdate(payload.new)
    }
  )
  .subscribe()
```

### Push Notification Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Alert      │────▶│  Backend    │────▶│   Firebase  │────▶│   Mobile    │
│  Trigger    │     │  Server     │     │    FCM      │     │   App       │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                           │
                           │ 1. Detect alert condition
                           │ 2. Determine recipients
                           │ 3. Format notification
                           │ 4. Send to FCM
                           │
```

**FCM Message Structure:**
```json
{
  "to": "<device_fcm_token>",
  "notification": {
    "title": "溫度警報",
    "body": "COLD-TRUCK-001 溫度異常: 12.3°C",
    "sound": "alert_high",
    "badge": 1
  },
  "data": {
    "type": "temperature_alert",
    "tag_mac": "AA:BB:CC:DD:EE:01",
    "temperature": 12.3,
    "threshold": 8.0,
    "latitude": 25.0478,
    "longitude": 121.5170,
    "timestamp": "2026-03-18T14:32:00Z"
  },
  "android": {
    "priority": "high",
    "notification": {
      "channel_id": "critical_alerts"
    }
  },
  "apns": {
    "payload": {
      "aps": {
        "sound": "critical",
        "interruption-level": "critical"
      }
    }
  }
}
```

### External Service Integration

| Service | Purpose | API/SDK |
|---------|---------|---------|
| Firebase Cloud Messaging | Push notifications | Firebase SDK |
| Mapbox | Maps, navigation | Mapbox GL SDK |
| Supabase Storage | Photo uploads | Supabase JS |
| Sentry | Error tracking | Sentry React Native |
| Mixpanel | Analytics | Mixpanel SDK |

---

## 10. Offline Mode Design

### Offline Capabilities

| Feature | Offline Support | Sync Strategy |
|---------|-----------------|---------------|
| View tag list | Full | Read from local cache |
| View tag detail | Full | Read from local cache |
| View temperature history | Partial (cached) | Cache last 24h |
| Scan QR code | Full | Queue for sync |
| View tasks | Full | Read from local cache |
| Complete task | Full | Queue, sync when online |
| Capture photos | Full | Store locally, upload when online |
| Navigation | Partial | Pre-download route |
| Create task | Full | Queue, sync when online |
| Chat | No | Online only |

### Sync Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          WatermelonDB                                    │
│                                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │    Tags     │  │    Tasks    │  │   Scans     │  │   Photos    │    │
│  │   (local)   │  │   (local)   │  │  (pending)  │  │  (pending)  │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘    │
│         │                │                │                │           │
│         └────────────────┼────────────────┼────────────────┘           │
│                          │                │                             │
│                   ┌──────┴────────────────┴──────┐                      │
│                   │        Sync Engine          │                      │
│                   └──────────────┬───────────────┘                      │
└──────────────────────────────────┼───────────────────────────────────────┘
                                   │
                                   │ When online:
                                   │ 1. Push pending changes
                                   │ 2. Pull server changes
                                   │ 3. Resolve conflicts
                                   │
                                   ▼
                    ┌───────────────────────────────┐
                    │       Backend API             │
                    │       /api/mobile/sync        │
                    └───────────────────────────────┘
```

### Conflict Resolution

**Strategy:** Last-Write-Wins with server priority for critical data

| Data Type | Conflict Strategy | Notes |
|-----------|-------------------|-------|
| Tag status | Server wins | Server has authoritative sensor data |
| Task status | Manual merge | User prompted if conflict |
| Scan history | Append both | No conflict possible |
| Photos | Keep all | Upload all, no deletion |
| Checklist | Merge items | Union of checked items |

**Conflict Resolution Flow:**
```javascript
async function resolveTaskConflict(localTask, serverTask) {
  // If server task was completed, server wins
  if (serverTask.status === 'completed' && localTask.status === 'completed') {
    // Both completed - keep earliest completion time
    return serverTask.completed_at < localTask.completed_at
      ? serverTask
      : localTask;
  }

  // If statuses differ, prompt user
  if (localTask.status !== serverTask.status) {
    return await promptUserForResolution(localTask, serverTask);
  }

  // Otherwise, merge fields
  return {
    ...serverTask,
    notes: `${serverTask.notes}\n---\n${localTask.notes}`,
    checklist: mergeChecklists(serverTask.checklist, localTask.checklist),
  };
}
```

### Background Sync

**Trigger Conditions:**
- App foreground after background period
- Network connectivity restored
- User initiates pull-to-refresh
- Every 5 minutes while app active
- Immediately for critical changes (task completion)

**Implementation:**
```javascript
// Android WorkManager
import { BackgroundFetch } from 'react-native-background-fetch'

BackgroundFetch.configure({
  minimumFetchInterval: 15,  // 15 minutes minimum
  stopOnTerminate: false,
  startOnBoot: true,
  enableHeadless: true,
}, async (taskId) => {
  console.log('[BackgroundFetch] Task:', taskId);

  await syncService.performSync();

  BackgroundFetch.finish(taskId);
}, (taskId) => {
  console.log('[BackgroundFetch] Timeout:', taskId);
  BackgroundFetch.finish(taskId);
});
```

### Offline Indicators

```
┌─────────────────────────────────────────┐
│ [📴 離線模式]  UTtag              ⚙️ 🔔 │
├─────────────────────────────────────────┤
│                                         │
│ ⚠️ 您目前處於離線模式                    │
│    資料最後更新: 15 分鐘前               │
│    [ 重新連線 ]                         │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ 待同步項目: 3                        │ │
│ │ • 完成任務: 送貨至大潤發             │ │
│ │ • 掃描紀錄: 5 筆                     │ │
│ │ • 照片上傳: 2 張                     │ │
│ └─────────────────────────────────────┘ │
│                                         │
└─────────────────────────────────────────┘
```

---

## 11. Push Notification Strategy

### Notification Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Alert Detection Layer                           │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐               │
│  │  Temperature  │  │   Geofence    │  │    Battery    │               │
│  │   Monitor     │  │   Monitor     │  │   Monitor     │               │
│  └───────┬───────┘  └───────┬───────┘  └───────┬───────┘               │
│          │                  │                  │                        │
│          └──────────────────┼──────────────────┘                        │
│                             ▼                                           │
│                   ┌─────────────────────┐                               │
│                   │  Alert Processor    │                               │
│                   │  • Deduplication    │                               │
│                   │  • Rate limiting    │                               │
│                   │  • User preferences │                               │
│                   └─────────┬───────────┘                               │
│                             │                                           │
└─────────────────────────────┼───────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       Notification Router                                │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    User Preferences Check                         │  │
│  │  • Is user subscribed to this alert type?                         │  │
│  │  • Is user in quiet hours?                                        │  │
│  │  • Is this a duplicate within cooldown period?                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                             │                                           │
│              ┌──────────────┼──────────────┐                            │
│              │              │              │                            │
│              ▼              ▼              ▼                            │
│       ┌───────────┐  ┌───────────┐  ┌───────────┐                      │
│       │   FCM     │  │   Email   │  │  In-App   │                      │
│       │  (Push)   │  │           │  │  Banner   │                      │
│       └───────────┘  └───────────┘  └───────────┘                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Notification Channels (Android)

```kotlin
// Android notification channels
val channels = listOf(
    NotificationChannel(
        "critical_alerts",
        "緊急警報",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "SOS、溫度異常等緊急警報"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 500, 200, 500)
        setBypassDnd(true)  // Bypass Do Not Disturb
    },

    NotificationChannel(
        "standard_alerts",
        "一般通知",
        NotificationManager.IMPORTANCE_DEFAULT
    ).apply {
        description = "圍欄警報、電量低等一般通知"
    },

    NotificationChannel(
        "task_updates",
        "任務更新",
        NotificationManager.IMPORTANCE_LOW
    ).apply {
        description = "任務指派、狀態變更"
    }
)
```

### Rate Limiting

To prevent notification fatigue:

| Alert Type | Cooldown Period | Max per Hour |
|------------|-----------------|--------------|
| SOS/Emergency | None | Unlimited |
| Temperature Excursion | 5 minutes per tag | 12 |
| Geofence Breach | 10 minutes per tag/zone | 6 |
| Battery Low | 1 hour per tag | 1 |
| Tag Offline | 4 hours per tag | 1 |
| Task Assignment | None | Unlimited |

### Notification Preferences UI

```
┌─────────────────────────────────────────┐
│ ← 通知設定                              │
├─────────────────────────────────────────┤
│                                         │
│ 推播通知                        [開啟]  │
│ ─────────────────────────────────────── │
│                                         │
│ 警報類型                                │
│ ┌─────────────────────────────────────┐ │
│ │ 🆘 緊急警報 (SOS)          [開啟] ✓ │ │
│ │    無法關閉                          │ │
│ ├─────────────────────────────────────┤ │
│ │ 🌡️ 溫度異常                 [開啟] ✓ │ │
│ │    通知聲音: 警報音 ▼                │ │
│ ├─────────────────────────────────────┤ │
│ │ 📍 圍欄警報                 [開啟] ✓ │ │
│ ├─────────────────────────────────────┤ │
│ │ 🔋 電量過低                 [關閉]   │ │
│ ├─────────────────────────────────────┤ │
│ │ ⚫ 標籤離線                 [關閉]   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 勿擾時段                                │
│ ┌─────────────────────────────────────┐ │
│ │ 啟用勿擾                    [開啟]   │ │
│ │ 時段: 22:00 - 07:00                 │ │
│ │ ⚠️ 緊急警報仍會通知                  │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ 僅通知我負責的標籤            [開啟] ✓  │
│                                         │
└─────────────────────────────────────────┘
```

### Rich Notifications

**iOS Rich Notification with Actions:**
```
┌─────────────────────────────────────────┐
│ UTtag                          now      │
├─────────────────────────────────────────┤
│                                         │
│ 🌡️ 溫度警報                             │
│                                         │
│ COLD-TRUCK-001 目前溫度: 12.3°C        │
│ 超過設定上限 8°C                        │
│ 位置: 台北市中山區                      │
│                                         │
│ ┌─────────────────┬───────────────────┐ │
│ │    查看詳情     │     導航至此      │ │
│ └─────────────────┴───────────────────┘ │
└─────────────────────────────────────────┘
```

---

## 12. Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Definition | Target | Measurement |
|--------|------------|--------|-------------|
| **App Store Rating** | Average user rating | >= 4.0 stars | App Store/Play Store |
| **Daily Active Users (DAU)** | Unique users per day | 70% of field workforce | Analytics |
| **Monthly Active Users (MAU)** | Unique users per month | 90% of field workforce | Analytics |
| **Session Duration** | Average time in app | 5-10 minutes | Analytics |
| **Alert Response Time** | Time from alert to acknowledgment | 60% reduction | Alert logs |
| **Task Completion via Mobile** | % of tasks completed on mobile | 80% | Task logs |
| **Offline Usage** | % of sessions with offline activity | 15%+ | Analytics |
| **Scan Success Rate** | Successful scans / Total attempts | 98%+ | Scan logs |
| **Push Opt-in Rate** | Users with push enabled | 85%+ | FCM stats |
| **Crash-Free Sessions** | Sessions without crashes | 99.5%+ | Crashlytics |

### Operational Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| API Response Time (p95) | <500ms | >1000ms |
| Push Delivery Rate | 99%+ | <95% |
| Push Latency | <30 seconds | >60 seconds |
| Sync Success Rate | 99%+ | <98% |
| App Launch Time | <2 seconds | >3 seconds |
| Battery Usage (8hr shift) | <15% | >25% |
| Offline Sync Queue | <50 items | >200 items |

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Task Completion Time | 30% reduction | A/B comparison |
| Tag Lookup Time | <3 seconds (scan) | UX testing |
| Navigation Start Time | <5 seconds | UX testing |
| Photo Upload Time | <10 seconds (WiFi) | Performance logs |
| User Onboarding Completion | 90%+ | Analytics |

### Business Metrics

| Metric | Target | Timeframe |
|--------|--------|-----------|
| Field Workforce Adoption | 80% within 90 days | Quarterly |
| Support Ticket Reduction | 30% reduction | Monthly |
| Customer Satisfaction (CSAT) | 4.0+ / 5.0 | Quarterly survey |
| Net Promoter Score (NPS) | 40+ | Quarterly survey |

### Dashboard Widgets

**Mobile App Health Dashboard:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Mobile App Health                                      Last 7 Days      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ ┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐│
│ │ DAU           │  │ Crash-Free    │  │ Push Delivery │  │ App Rating  ││
│ │    1,234      │  │   99.7%       │  │    99.2%      │  │   4.3★      ││
│ │   ↑ 12%       │  │   ↑ 0.2%      │  │   ↓ 0.3%      │  │   ↑ 0.1     ││
│ └───────────────┘  └───────────────┘  └───────────────┘  └─────────────┘│
│                                                                          │
│ Usage by Platform                      Feature Usage                     │
│ ┌─────────────────────────────────┐  ┌─────────────────────────────────┐│
│ │ iOS: 45%      Android: 55%     │  │ Map View: 89%                   ││
│ │ ████████░░░░░ █████████░░░░    │  │ QR Scan: 76%                    ││
│ │                                 │  │ Tasks: 62%                      ││
│ │ Version Distribution:           │  │ Navigation: 45%                 ││
│ │ v1.2.0: 78%  v1.1.0: 20%  Old: 2% │ │ Chat: 34%                      ││
│ └─────────────────────────────────┘  └─────────────────────────────────┘│
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 13. Out of Scope

The following items are explicitly excluded from Phase 4:

| Item | Reason | Future Phase |
|------|--------|--------------|
| Tablet-optimized layout | Focus on phones first | Phase 5 |
| Apple Watch / Wear OS app | Complexity, lower priority | Phase 6+ |
| White-label per tenant | Requires app store variants | Phase 5 |
| Custom Bluetooth hardware | Requires hardware development | Phase 6+ |
| Video capture | Storage costs, complexity | Phase 5 |
| Voice commands | Complexity, limited use case | Future |
| Multi-language UI | Focus on zh-TW first | Phase 5 |
| Apple CarPlay / Android Auto | Requires additional certification | Phase 6+ |
| Widget (iOS/Android) | Nice-to-have, not MVP | Phase 4b |
| Biometric tag reading (NFC) | Limited device support | Future |
| Augmented Reality full mode | Experimental, Phase 4c pilot only | Phase 5 |

---

## 14. Timeline & Milestones

### Phase 4a: MVP (8-10 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 1-2 | Project Setup & Architecture | React Native project, navigation, CI/CD |
| 3 | Authentication | Login, biometric auth, token management |
| 4 | Map View | Tag map with clustering, real-time updates |
| 5 | Tag Detail & Search | Detail view, search, filter |
| 6 | QR Scanner | Single scan, manual lookup |
| 7 | Push Notifications | FCM integration, alert handling |
| 8 | Task List & Basic Completion | View tasks, mark complete |
| 9-10 | QA, Bug Fixes, Beta Testing | TestFlight, internal testing |

### Phase 4b: Enhanced Features (4-6 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 11-12 | Offline Mode | WatermelonDB, sync engine |
| 13 | Batch Scanning | Continuous scan mode |
| 14 | Photo & Signature Capture | Delivery proof workflow |
| 15 | In-App Navigation | Mapbox navigation integration |
| 16 | Route Optimization & Voice Notes | Multi-stop routing |

### Phase 4c: Advanced Features (4 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 17-18 | Chat Integration | Phase 1 chat in mobile |
| 19 | Goods Receipt/Dispatch | Warehouse workflows |
| 20 | AR Tag Finder (Pilot) | Camera-based tag location |

### Key Dates

| Date | Event |
|------|-------|
| 2026-04-01 | Phase 4a kickoff |
| 2026-04-15 | Development environment ready |
| 2026-05-15 | Internal alpha release |
| 2026-06-01 | Beta testing begins |
| 2026-06-15 | Phase 4a MVP release (App Store) |
| 2026-07-15 | Phase 4b release |
| 2026-08-15 | Phase 4c release |
| 2026-08-22 | Phase 4 complete, retrospective |

### Release Strategy

**Alpha Testing (Week 9):**
- Internal team only
- Focus on core functionality
- Crashlytics monitoring

**Beta Testing (Week 10):**
- 50 selected field users
- TestFlight (iOS) / Firebase App Distribution (Android)
- Feedback collection via in-app form

**Production Launch:**
- Phased rollout: 10% → 50% → 100%
- Monitor crash rates and performance
- 24/7 on-call during first week

---

## 15. Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|------------|-------|--------|-------------------|
| Existing REST APIs | Backend Team | Ready | Critical - blocks all API work |
| Supabase Realtime | DevOps | Ready | Critical - blocks real-time features |
| Firebase Project Setup | DevOps | Pending | Critical - blocks push notifications |
| Mapbox Account & API Key | DevOps | Pending | High - blocks map features |
| Apple Developer Account | Admin | Ready | Critical - blocks iOS release |
| Google Play Console | Admin | Ready | Critical - blocks Android release |
| App Signing Certificates | DevOps | Pending | Critical - blocks store release |
| Phase 1 Chat API | Previous Phase | Ready | Medium - blocks chat integration |

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| React Native performance with 500+ markers | Medium | High | Early performance testing, consider Flutter for map view |
| Push notification delivery issues | Medium | High | Fallback to in-app polling, FCM redundancy |
| Offline sync conflicts | Medium | Medium | Clear conflict resolution UX, server-wins for critical data |
| App store rejection | Low | High | Pre-submission review, follow guidelines strictly |
| Battery drain complaints | Medium | Medium | Background task optimization, battery usage monitoring |
| iOS permissions complexity | Medium | Medium | Clear permission request flow, fallback functionality |
| QR scanning in low light | Medium | Medium | Flashlight integration, manual fallback |
| Backend API changes breaking app | Low | High | API versioning, graceful degradation |

### Security Considerations

1. **Authentication Security:**
   - JWT tokens with short expiry (24h)
   - Biometric unlock with secure enclave
   - Certificate pinning for API calls

2. **Data Security:**
   - SQLite encryption for offline data
   - Secure storage for sensitive tokens
   - No PII in crash reports

3. **Permission Handling:**
   - Request only necessary permissions
   - Clear explanation for each permission
   - Graceful functionality without optional permissions

### Rollback Plan

1. **App Store Rollback:**
   - Maintain previous version for quick rollback
   - Server-side feature flags for disabling features
   - Force update mechanism for critical fixes

2. **API Compatibility:**
   - Support previous API version for 90 days
   - Graceful degradation for new features

3. **Database Migration:**
   - Schema migrations tested on device
   - Fallback to clear cache and re-sync

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| BLE | Bluetooth Low Energy - wireless communication protocol |
| DAU | Daily Active Users |
| FCM | Firebase Cloud Messaging - push notification service |
| MAU | Monthly Active Users |
| MVP | Minimum Viable Product |
| NFC | Near Field Communication - short-range wireless |
| POD | Proof of Delivery |
| RLS | Row Level Security |
| SQLite | Embedded relational database |
| WatermelonDB | React Native offline-first database |
| WebSocket | Full-duplex communication protocol |

### B. Related Documents

- Phase 1 PRD: Real-time Chat (Completed)
- Phase 2 PRD: Report Scheduling (Completed)
- Phase 3 PRD: Multi-tenant Management (Completed)
- UTtag Technical Architecture Document
- Supabase Schema Reference (`supabase-schema.sql`)
- API Authentication Guide (`lib/auth.js`)

### C. Competitive Reference Apps

| App | Platform | Notable Features |
|-----|----------|------------------|
| Sensitech TempTale | iOS, Android | Bluetooth pairing, detailed charts |
| Tive | iOS, Android | Real-time tracking, geofencing |
| Zebra VisibilityIQ | iOS, Android | Enterprise logistics, scanning |
| ShipTrack | iOS, Android | Delivery management, POD |

### D. Device Requirements

**Minimum Supported:**
- iOS 15.0+
- Android 8.0+ (API 26)
- Camera for QR scanning
- GPS for location

**Recommended:**
- iOS 16.0+
- Android 11.0+
- 3GB+ RAM
- 50MB+ available storage

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
| Design Lead | | [ ] Pending | |
| Security Lead | | [ ] Pending | |
| Mobile Dev Lead | | [ ] Pending | |

---

*This document is subject to change based on stakeholder feedback and technical discovery.*
