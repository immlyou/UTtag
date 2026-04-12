# UTtag Version History

## v4.6.0 - Mobile App Foundation (2026-03-18)

### New Features
- **Mobile API Endpoints**: New `/api/mobile/*` routes for mobile app support
  - Device registration for FCM push notifications
  - Location tracking with nearby tags detection
  - Offline data synchronization
  - Notification preferences management
- **Push Notification Service**: Firebase Cloud Messaging integration
  - Multi-platform support (iOS/Android)
  - Alert type-based notification channels
  - Rate limiting and quiet hours support
  - Automatic invalid token cleanup
- **Mobile Project Scaffold**: React Native (Expo) project setup
  - Zustand state management
  - React Navigation with bottom tabs
  - Offline-first sync service
  - Map view with tag markers

### Database Changes
- Added `mobile_devices` table for FCM token storage
- Added `user_locations` table for driver tracking
- Added `tasks` table for mobile task management
- Added `alerts` table for push notification logging
- Added `scan_history` table for QR code scans
- Added `notification_preferences` table for user settings
- Added `find_nearby_tags()` function for geospatial queries
- Added RLS policies for all mobile tables

### Backend Changes
- New mobile API routes in `server.js`
- Push notification service in `lib/push.js`
- Firebase Admin SDK integration

---

## v4.5.0 - Real-time Speed Calculation (2026-03-15)

### Features
- Real-time speed calculation for all tags based on GPS data
- Speed display on map markers and tag cards

---

## v4.4.0 - Coordinate Fix (2026-03-14)

### Bug Fixes
- Fixed simulated tag coordinates to stay on land (Taiwan region)

---

## v4.3.0 - Performance Optimization (2026-03-12)

### Performance
- Drastically reduced first-load time for 300+ tags
- Optimized map and tag list rendering

---

## v4.2.0 - Tag Filter Toggle (2026-03-10)

### Features
- Added real/simulated tag filter toggle in settings
- Improved tag categorization

---

## v4.1.0 - Multi-tenant Management (2026-03-01)

### Features
- Multi-tenant user management (Phase 3)
- Role-based access control (RBAC)
- Tenant user portal
- API key management per tenant
- Audit logging

### Database Changes
- Added `tenant_users` table
- Added `permissions` and `role_permissions` tables
- Added `audit_logs` table
- Added `tenant_settings` table

---

## v4.0.0 - Report Scheduling System (2026-02-15)

### Features
- Automated report scheduling (daily/weekly/monthly)
- PDF report generation
- Email delivery via Resend
- Report execution history

### Database Changes
- Added `report_schedules` table
- Added `report_executions` table

---

## v3.0.0 - B2B API & Real-time Chat (2026-01-20)

### Features
- B2B API with API key authentication
- Real-time chat system
- Usage tracking and billing tiers
- Sensor data push API

### Database Changes
- Added `api_keys` table
- Added chat tables (`chat_users`, `conversations`, `messages`)
- Added `usage_logs` and `usage_daily` tables

---

## v2.0.0 - Device Tracking (2025-12-01)

### Features
- PDA/device registration and tracking
- Device check-in with nearby tags
- Device location history

### Database Changes
- Added `devices` table
- Added `device_checkins` table

---

## v1.0.0 - Initial Release (2025-11-01)

### Features
- Basic tag monitoring dashboard
- Temperature/humidity/pressure display
- Client management
- Admin authentication
