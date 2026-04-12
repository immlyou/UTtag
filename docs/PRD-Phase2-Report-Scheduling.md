# Product Requirements Document (PRD)
# Phase 2: Report Scheduling & Auto-send (報表排程自動寄送)

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
6. [Report Types](#6-report-types)
7. [Functional Requirements](#7-functional-requirements)
8. [Technical Architecture](#8-technical-architecture)
9. [Database Schema](#9-database-schema)
10. [API Specifications](#10-api-specifications)
11. [UI/UX Requirements](#11-uiux-requirements)
12. [Success Metrics](#12-success-metrics)
13. [Out of Scope](#13-out-of-scope)
14. [Timeline & Milestones](#14-timeline--milestones)
15. [Dependencies & Risks](#15-dependencies--risks)
16. [Appendix](#appendix)

---

## 1. Executive Summary

### Overview
Phase 2 introduces automated report scheduling and delivery capabilities to the UTtag cold chain logistics platform. This feature enables users to configure recurring reports (temperature logs, geofence events, task summaries, compliance reports) to be automatically generated and delivered via email at specified intervals.

### Business Value
- Reduce manual effort for compliance reporting by 80%
- Ensure regulatory compliance (HACCP, GDP, GSP) through automated documentation
- Improve operational visibility with scheduled summaries
- Enable proactive issue identification through regular reporting

### Target Users
- **Logistics Managers:** Weekly/monthly fleet and shipment reports
- **Compliance Officers:** Daily HACCP and regulatory reports
- **Operations Leads:** Task completion and performance summaries
- **Quality Assurance Teams:** Temperature excursion and deviation reports

---

## 2. Problem Statement

### Current Situation
Currently, UTtag users must manually:
1. Log into the dashboard to view data
2. Export data to spreadsheets
3. Format reports for compliance submission
4. Email reports to stakeholders
5. Repeat this process daily/weekly/monthly

### Pain Points

| Pain Point | Impact | Severity |
|------------|--------|----------|
| Manual report generation is time-consuming | 2-4 hours/week per user | High |
| Risk of missing compliance deadlines | Regulatory fines, audit failures | Critical |
| Inconsistent report formats | Communication issues, data misinterpretation | Medium |
| No historical report archive | Audit trail gaps | High |
| Stakeholders lack self-service access | Increased support burden | Medium |

### Regulatory Requirements

**HACCP (Hazard Analysis Critical Control Points)**
- Daily temperature monitoring logs required
- Deviation documentation with corrective actions
- 2-year record retention mandatory

**GDP (Good Distribution Practice)**
- Temperature mapping and monitoring records
- Transportation condition documentation
- Excursion event reporting within 24 hours

**GSP (Good Storage Practice)**
- Continuous temperature monitoring logs
- Equipment calibration records
- Monthly summary reports

### User Quotes
> "I spend every Monday morning pulling the same temperature reports. It's repetitive and error-prone." - Logistics Manager

> "We've missed compliance deadlines because someone forgot to run the report. Automation would save us." - Compliance Officer

---

## 3. Goals & Objectives

### Primary Goals
1. **Automate compliance reporting** - Eliminate manual report generation for regulatory requirements
2. **Ensure timely delivery** - Reports delivered to stakeholders without human intervention
3. **Maintain audit trail** - Archive all generated reports with timestamps

### Success Criteria
| Metric | Target | Measurement |
|--------|--------|-------------|
| Report generation automation rate | 90% of recurring reports | System logs |
| Delivery success rate | 99.5% | Delivery confirmations |
| User time savings | 3+ hours/week | User surveys |
| Compliance deadline adherence | 100% | Audit records |

### Non-Goals (This Phase)
- Real-time push notifications (completed in Phase 1)
- Custom report template builder
- AI-powered anomaly insights
- Third-party system integration (SAP, Oracle)

---

## 4. User Stories

### Epic: Automated Report Scheduling

#### US-2.1: Schedule Creation
**As a** logistics manager
**I want to** create a scheduled report that runs weekly
**So that** I receive temperature summaries every Monday without manual effort

**Acceptance Criteria:**
- [ ] Can select report type from predefined list
- [ ] Can choose frequency (daily, weekly, monthly)
- [ ] Can select specific time and timezone
- [ ] Can specify recipient email addresses
- [ ] Schedule is saved and displayed in schedule list

#### US-2.2: Compliance Reporting
**As a** compliance officer
**I want to** receive daily HACCP reports at 6 AM
**So that** I can review deviations before the workday starts

**Acceptance Criteria:**
- [ ] HACCP report includes all temperature excursions
- [ ] Report highlights corrective actions required
- [ ] Delivered as PDF attachment
- [ ] Includes regulatory-compliant formatting

#### US-2.3: Task Summary Reports
**As an** operations lead
**I want to** receive weekly task completion summaries
**So that** I can track team performance and pending items

**Acceptance Criteria:**
- [ ] Shows completed vs pending tasks
- [ ] Grouped by assignee
- [ ] Includes completion rate percentage
- [ ] Links to detailed task records

#### US-2.4: Schedule Management
**As a** user
**I want to** view, edit, and delete my scheduled reports
**So that** I can adjust reporting as needs change

**Acceptance Criteria:**
- [ ] List view of all my schedules
- [ ] Can enable/disable schedules without deleting
- [ ] Can edit schedule parameters
- [ ] Can delete schedules with confirmation
- [ ] Shows last run status and next run time

#### US-2.5: Geofence Event Reports
**As a** logistics manager
**I want to** receive alerts when vehicles enter/exit geofences
**So that** I can monitor delivery progress and deviations

**Acceptance Criteria:**
- [ ] Report includes entry/exit timestamps
- [ ] Shows geofence name and location
- [ ] Includes tag/vehicle identification
- [ ] Groups events by date

#### US-2.6: Batch Traceability
**As a** quality assurance manager
**I want to** generate batch traceability reports
**So that** I can trace product journey for recall scenarios

**Acceptance Criteria:**
- [ ] Full chain of custody from origin to destination
- [ ] Temperature profile throughout journey
- [ ] All handler touchpoints
- [ ] Exportable as PDF

---

## 5. Feature Scope

### MVP (Must Have) - Phase 2a

| Feature | Description | Priority |
|---------|-------------|----------|
| Schedule CRUD | Create, read, update, delete report schedules | P0 |
| Frequency Options | Daily, weekly, monthly intervals | P0 |
| Email Delivery | Send reports via email (SendGrid/Resend) | P0 |
| Temperature Report | Temperature excursion report generation | P0 |
| PDF Generation | Export reports as PDF attachments | P0 |
| Schedule Dashboard | UI for managing schedules | P0 |
| Timezone Support | Proper handling of user timezones | P0 |

### Phase 2b (Should Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| LINE Delivery | Send reports via LINE messaging | P1 |
| Telegram Delivery | Send reports via Telegram bot | P1 |
| Custom Time | Specify exact hour/minute for delivery | P1 |
| Multiple Recipients | Add multiple email recipients | P1 |
| Report Preview | Preview report before scheduling | P1 |
| Geofence Report | Geofence event report type | P1 |
| Task Report | Task completion report type | P1 |

### Phase 2c (Nice to Have)

| Feature | Description | Priority |
|---------|-------------|----------|
| HACCP Report | Full HACCP compliance report | P2 |
| Batch Traceability | Product journey traceability | P2 |
| Report Archive | Historical report storage | P2 |
| Delivery Retry | Automatic retry on failure | P2 |
| Calendar Integration | iCal/Google Calendar sync | P3 |

---

## 6. Report Types

### 6.1 Temperature Excursion Report (溫度逸脫報告)

**Purpose:** Document temperature deviations from acceptable ranges

**Data Included:**
- Tag/Device MAC address and name
- Timestamp of excursion (start/end)
- Temperature reading during excursion
- Duration of excursion
- Threshold values violated
- Location (if available)

**Format:**
```
==========================================
Temperature Excursion Report
Report Period: 2026-03-17 to 2026-03-18
==========================================

Summary:
- Total Tags Monitored: 45
- Tags with Excursions: 3
- Total Excursion Events: 7
- Critical Events (>5°C deviation): 2

Detailed Events:
------------------------------------------
Tag: COLD-TRUCK-001 (AA:BB:CC:DD:EE:01)
Event #1:
  - Start: 2026-03-17 14:32 CST
  - End: 2026-03-17 15:18 CST
  - Duration: 46 minutes
  - Max Temperature: 12.3°C (Threshold: 8°C)
  - Location: Highway 61, km 234
  - Severity: Critical
  - Action Required: Yes

[Additional events...]
```

### 6.2 Geofence Event Report (圍欄事件報告)

**Purpose:** Track vehicle/shipment movements across defined zones

**Data Included:**
- Geofence name and coordinates
- Entry/exit timestamps
- Dwell time within zone
- Tag/vehicle identification
- Sequence of zone transitions

**Format:**
```
==========================================
Geofence Event Report
Report Period: 2026-03-11 to 2026-03-18
==========================================

Zone: Taipei Distribution Center
Events:
  - 2026-03-17 08:15 - TRUCK-001 ENTERED
  - 2026-03-17 09:42 - TRUCK-001 EXITED (Dwell: 1h 27m)
  - 2026-03-17 10:30 - TRUCK-002 ENTERED
  ...
```

### 6.3 Task Completion Report (任務完成報告)

**Purpose:** Summarize task progress and team performance

**Data Included:**
- Tasks completed vs assigned
- Completion rate by assignee
- Overdue tasks
- Average completion time
- Task categories breakdown

### 6.4 HACCP Compliance Report (HACCP 合規報告)

**Purpose:** Meet HACCP regulatory documentation requirements

**Data Included:**
- Critical Control Points (CCPs) monitored
- Temperature readings at each CCP
- Deviations and corrective actions
- Verification activities
- Record-keeping compliance status

**Regulatory Format:**
- Follows FDA/TFDA HACCP documentation standards
- Includes required signatures/approvals section
- Retains data for minimum 2 years

### 6.5 Batch Traceability Report (批次追溯報告)

**Purpose:** Full product journey documentation for recalls

**Data Included:**
- Batch/lot number
- Origin to destination chain
- All handler touchpoints
- Temperature profile throughout
- Storage conditions at each point
- Time at each location

---

## 7. Functional Requirements

### FR-1: Schedule Management

| ID | Requirement | Notes |
|----|-------------|-------|
| FR-1.1 | User can create new report schedule | Maximum 50 schedules per user |
| FR-1.2 | User can view list of all schedules | Sorted by next run time |
| FR-1.3 | User can edit existing schedule | Changes apply from next run |
| FR-1.4 | User can delete schedule | Requires confirmation |
| FR-1.5 | User can enable/disable schedule | Preserves configuration |
| FR-1.6 | System shows last run status | Success/failure indicator |
| FR-1.7 | System shows next scheduled run | Based on timezone |

### FR-2: Report Configuration

| ID | Requirement | Notes |
|----|-------------|-------|
| FR-2.1 | User can select report type | From predefined list |
| FR-2.2 | User can select frequency | Daily/weekly/monthly |
| FR-2.3 | User can select day of week | For weekly reports |
| FR-2.4 | User can select day of month | For monthly reports |
| FR-2.5 | User can select time of day | Hour granularity (MVP) |
| FR-2.6 | User can set timezone | Defaults to browser TZ |
| FR-2.7 | User can select tags/devices | Multi-select or "All" |
| FR-2.8 | User can set date range | "Last 24h", "Last 7d", etc. |

### FR-3: Delivery Configuration

| ID | Requirement | Notes |
|----|-------------|-------|
| FR-3.1 | User can add email recipients | Up to 10 per schedule |
| FR-3.2 | User receives confirmation email | When schedule created |
| FR-3.3 | System delivers report at scheduled time | Within 5 minute window |
| FR-3.4 | Report delivered as PDF attachment | Plus inline summary |
| FR-3.5 | Failed deliveries are logged | With error details |
| FR-3.6 | User notified of delivery failures | Via email/in-app |

### FR-4: Report Generation

| ID | Requirement | Notes |
|----|-------------|-------|
| FR-4.1 | System queries sensor_data table | Based on date range |
| FR-4.2 | System applies tag/device filters | Per schedule config |
| FR-4.3 | System calculates statistics | Min/max/avg/excursions |
| FR-4.4 | System generates PDF | Using template |
| FR-4.5 | PDF includes company branding | Logo, colors |
| FR-4.6 | PDF includes generation timestamp | With timezone |

---

## 8. Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        UTtag Platform                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐  │
│  │   Frontend  │────│   Express   │────│     Supabase        │  │
│  │  (Vanilla)  │    │   Server    │    │    PostgreSQL       │  │
│  └─────────────┘    └──────┬──────┘    └─────────────────────┘  │
│                            │                      ▲              │
│                            │                      │              │
│  ┌─────────────────────────┼──────────────────────┼───────────┐ │
│  │                    Scheduler System                         │ │
│  │  ┌─────────────┐   ┌────┴────┐   ┌─────────────┐           │ │
│  │  │  node-cron  │───│  Report │───│    PDF      │           │ │
│  │  │  Scheduler  │   │ Service │   │  Generator  │           │ │
│  │  └─────────────┘   └────┬────┘   └─────────────┘           │ │
│  │                         │                                   │ │
│  │                    ┌────┴────┐                              │ │
│  │                    │  Email  │                              │ │
│  │                    │ Service │                              │ │
│  │                    │(Resend) │                              │ │
│  │                    └─────────┘                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Scheduler | node-cron | Simple, reliable, fits existing Express stack |
| Email Service | Resend | Developer-friendly, good deliverability, free tier |
| PDF Generation | @react-pdf/renderer or PDFKit | Node.js native, no external deps |
| Queue (Optional) | pg-boss | PostgreSQL-backed, fits Supabase |
| Timezone | luxon or date-fns-tz | Robust timezone handling |

### Alternative: Supabase Edge Functions

For scalability, consider using Supabase Edge Functions with pg_cron:

```sql
-- Example: pg_cron job
SELECT cron.schedule(
  'process-scheduled-reports',
  '*/5 * * * *',  -- Every 5 minutes
  $$ SELECT process_due_schedules() $$
);
```

**Pros:**
- Serverless, no server management
- Scales automatically
- Integrates with Supabase auth

**Cons:**
- Cold start latency
- Limited execution time (60s)
- Debugging complexity

### Recommended Approach: Hybrid

1. **node-cron** runs on Express server for schedule checking
2. **Supabase Database** stores schedules and report configs
3. **Resend API** handles email delivery
4. **Local PDF generation** using PDFKit

---

## 9. Database Schema

### New Tables

```sql
-- ============================================
-- Report Scheduling System
-- ============================================

-- 報表排程 (Report Schedules)
CREATE TABLE report_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Ownership
  created_by UUID REFERENCES admins(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- Schedule Name
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

  -- Filters
  tag_macs TEXT[] DEFAULT '{}',        -- Empty = all tags
  geofence_ids UUID[] DEFAULT '{}',    -- For geofence reports
  date_range_type TEXT DEFAULT 'last_24h' CHECK (date_range_type IN (
    'last_24h', 'last_7d', 'last_30d', 'last_month', 'custom'
  )),
  custom_range_days INTEGER,           -- For custom range

  -- Schedule Timing
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  run_at_hour INTEGER NOT NULL CHECK (run_at_hour >= 0 AND run_at_hour <= 23),
  run_at_minute INTEGER DEFAULT 0 CHECK (run_at_minute >= 0 AND run_at_minute <= 59),
  day_of_week INTEGER CHECK (day_of_week >= 0 AND day_of_week <= 6),  -- 0=Sunday
  day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
  timezone TEXT DEFAULT 'Asia/Taipei',

  -- Delivery Configuration
  delivery_method TEXT DEFAULT 'email' CHECK (delivery_method IN ('email', 'line', 'telegram')),
  recipients JSONB DEFAULT '[]',       -- [{email: "...", name: "..."}, ...]

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

-- 報表執行紀錄 (Report Execution Logs)
CREATE TABLE report_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  schedule_id UUID REFERENCES report_schedules(id) ON DELETE CASCADE,

  -- Execution Details
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  error_message TEXT,

  -- Report Data
  report_data JSONB,                   -- Cached report data
  pdf_url TEXT,                        -- Stored PDF location
  pdf_size_bytes INTEGER,

  -- Delivery Status
  delivery_status JSONB DEFAULT '[]', -- [{recipient, status, sent_at, error}]

  created_at TIMESTAMPTZ DEFAULT now()
);

-- 報表模板 (Report Templates) - Future Enhancement
CREATE TABLE report_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  template_html TEXT,
  template_css TEXT,
  header_config JSONB DEFAULT '{}',
  footer_config JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_schedules_next_run ON report_schedules(next_run_at)
  WHERE enabled = true;
CREATE INDEX idx_schedules_created_by ON report_schedules(created_by);
CREATE INDEX idx_schedules_client ON report_schedules(client_id);
CREATE INDEX idx_executions_schedule ON report_executions(schedule_id);
CREATE INDEX idx_executions_created ON report_executions(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER report_schedules_updated_at
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### Schema Relationships

```
                    ┌──────────────────┐
                    │     admins       │
                    └────────┬─────────┘
                             │ 1:n
                             ▼
┌───────────────┐    ┌──────────────────┐    ┌────────────────────┐
│   clients     │───▶│ report_schedules │───▶│ report_executions  │
└───────────────┘    └────────┬─────────┘    └────────────────────┘
                              │
                              │ references
                              ▼
                    ┌──────────────────┐
                    │   sensor_data    │
                    │   client_tags    │
                    └──────────────────┘
```

---

## 10. API Specifications

### Base URL
```
/api/schedules
```

### Authentication
All endpoints require admin authentication via Bearer token or API key.

### Endpoints

#### GET /api/schedules
List all report schedules for the authenticated user.

**Request:**
```http
GET /api/schedules HTTP/1.1
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "schedules": [
    {
      "id": "uuid-123",
      "name": "Daily Temperature Report",
      "report_type": "temperature_excursion",
      "frequency": "daily",
      "run_at_hour": 6,
      "timezone": "Asia/Taipei",
      "enabled": true,
      "last_run_at": "2026-03-17T06:00:00+08:00",
      "last_run_status": "success",
      "next_run_at": "2026-03-18T06:00:00+08:00",
      "recipients": [
        {"email": "manager@company.com", "name": "Manager"}
      ],
      "created_at": "2026-03-01T10:00:00+08:00"
    }
  ],
  "total": 1
}
```

#### POST /api/schedules
Create a new report schedule.

**Request:**
```http
POST /api/schedules HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Weekly HACCP Report",
  "report_type": "haccp_compliance",
  "frequency": "weekly",
  "day_of_week": 1,
  "run_at_hour": 8,
  "timezone": "Asia/Taipei",
  "date_range_type": "last_7d",
  "tag_macs": ["AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:02"],
  "recipients": [
    {"email": "compliance@company.com", "name": "Compliance Team"}
  ]
}
```

**Response (201 Created):**
```json
{
  "id": "uuid-456",
  "name": "Weekly HACCP Report",
  "next_run_at": "2026-03-24T08:00:00+08:00",
  "message": "Schedule created successfully"
}
```

#### GET /api/schedules/:id
Get details of a specific schedule.

#### PUT /api/schedules/:id
Update an existing schedule.

#### DELETE /api/schedules/:id
Delete a schedule.

#### POST /api/schedules/:id/run
Manually trigger a schedule execution.

**Response (202 Accepted):**
```json
{
  "execution_id": "uuid-789",
  "message": "Report generation started",
  "estimated_completion": "2026-03-18T14:35:00+08:00"
}
```

#### GET /api/schedules/:id/executions
List execution history for a schedule.

#### POST /api/schedules/preview
Generate a report preview without saving.

**Request:**
```http
POST /api/schedules/preview HTTP/1.1
Authorization: Bearer <token>
Content-Type: application/json

{
  "report_type": "temperature_excursion",
  "date_range_type": "last_24h",
  "tag_macs": []
}
```

**Response (200 OK):**
```json
{
  "preview": {
    "summary": {
      "total_tags": 45,
      "excursion_events": 3,
      "critical_events": 1
    },
    "sample_data": [...],
    "estimated_pdf_pages": 2
  }
}
```

---

## 11. UI/UX Requirements

### Navigation
Add "Report Schedules" (報表排程) to main navigation, under existing menu structure.

### Schedule List View

```
┌─────────────────────────────────────────────────────────────────┐
│ 報表排程 Report Schedules                    [+ 新增排程]       │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 搜尋排程...                              ▼ 全部狀態           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ○ Daily Temperature Report                         [啟用] ✓ │ │
│  │   類型: 溫度逸脫報告 | 頻率: 每日 06:00                      │ │
│  │   上次執行: 2026-03-17 06:00 ✓ 成功                         │ │
│  │   下次執行: 2026-03-18 06:00                                │ │
│  │                                          [編輯] [刪除] [執行]│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ○ Weekly HACCP Report                              [啟用] ✓ │ │
│  │   類型: HACCP 合規報告 | 頻率: 每週一 08:00                  │ │
│  │   上次執行: 2026-03-11 08:00 ✓ 成功                         │ │
│  │   下次執行: 2026-03-18 08:00                                │ │
│  │                                          [編輯] [刪除] [執行]│ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Create/Edit Schedule Modal

```
┌─────────────────────────────────────────────────────────────────┐
│ 新增報表排程                                              [✕]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  排程名稱 *                                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Daily Temperature Report                                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  報表類型 *                                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ▼ 溫度逸脫報告 (Temperature Excursion)                       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  頻率 *                          發送時間 *                       │
│  ┌───────────────────┐          ┌────────────────────────────┐  │
│  │ ○ 每日            │          │ 06 ▼ : 00 ▼  Asia/Taipei   │  │
│  │ ○ 每週            │          └────────────────────────────┘  │
│  │ ○ 每月            │                                          │
│  └───────────────────┘                                          │
│                                                                  │
│  資料範圍                                                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ▼ 過去 24 小時                                               │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  選擇 Tags (留空 = 全部)                                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ ☑ COLD-TRUCK-001  ☑ COLD-TRUCK-002  ☐ COLD-TRUCK-003 ...   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  收件人 Email *                                                  │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ manager@company.com                               [+ 新增]   │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│                              [取消]  [預覽報表]  [儲存排程]      │
└─────────────────────────────────────────────────────────────────┘
```

### Email Template

```html
Subject: [UTtag] 溫度逸脫報告 - 2026-03-18

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
            UTtag 自動報表
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

溫度逸脫報告 (Temperature Excursion Report)
報告期間: 2026-03-17 06:00 至 2026-03-18 06:00

📊 摘要
─────────────────────────────
監控 Tags:  45
逸脫事件:   3
嚴重事件:   1 ⚠️

詳細報告請參閱附件 PDF。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
此為自動產生的報表，請勿直接回覆。
管理報表排程: https://uttag.example.com/schedules
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 12. Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Definition | Target | Measurement |
|--------|------------|--------|-------------|
| **Adoption Rate** | % of users with 1+ active schedule | 60% | Monthly |
| **Schedules Created** | Total active schedules | 500+ | Cumulative |
| **Delivery Success Rate** | Successful deliveries / Total attempts | 99.5% | Weekly |
| **Time to First Schedule** | Time from signup to first schedule | <5 min | Per user |
| **User Retention** | Users still using after 30 days | 80% | Monthly |

### Operational Metrics

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Report generation time | <30 seconds | >60 seconds |
| Email delivery latency | <2 minutes | >5 minutes |
| PDF file size | <5 MB | >10 MB |
| Scheduler uptime | 99.9% | <99.5% |
| Failed deliveries | <0.5% | >2% |

### User Satisfaction Metrics

- **Net Promoter Score (NPS):** Target 50+
- **Feature usage survey:** Quarterly
- **Time saved per user:** Target 3+ hours/week

---

## 13. Out of Scope

The following items are explicitly excluded from Phase 2:

| Item | Reason | Future Phase |
|------|--------|--------------|
| Real-time push notifications | Completed in Phase 1 | N/A |
| Custom report template builder | Complexity, low initial demand | Phase 4+ |
| AI-powered anomaly detection | Requires ML infrastructure | Phase 5+ |
| Multi-language reports | Internationalization scope | Phase 3 |
| SAP/Oracle integration | Enterprise scope | Phase 6+ |
| White-label branding | Multi-tenant scope | Phase 3 |
| Report scheduling via API | API-first approach | Phase 2b |
| Webhook delivery | Developer feature | Phase 2c |
| SMS delivery | Cost considerations | Evaluated later |
| Report comparison (diff) | Advanced analytics | Phase 4+ |

---

## 14. Timeline & Milestones

### Phase 2a: MVP (4 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 1 | Database & Backend Foundation | Schema migration, API scaffolding |
| 2 | Core Scheduling | node-cron integration, schedule CRUD |
| 3 | Report Generation | Temperature report, PDF generation |
| 4 | Email Delivery & UI | Resend integration, schedule dashboard |

### Phase 2b: Enhanced Features (3 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 5 | Multiple Recipients | Recipient management, validation |
| 6 | Additional Reports | Geofence, Task completion reports |
| 7 | Preview & Custom Time | Report preview, minute-level scheduling |

### Phase 2c: Messaging Channels (2 weeks)

| Week | Milestone | Deliverables |
|------|-----------|--------------|
| 8 | LINE Integration | LINE Notify or Messaging API |
| 9 | Telegram Integration | Telegram Bot API |

### Key Dates

| Date | Event |
|------|-------|
| 2026-03-25 | Phase 2a kickoff |
| 2026-04-22 | Phase 2a MVP release |
| 2026-05-13 | Phase 2b release |
| 2026-05-27 | Phase 2c release |
| 2026-06-03 | Phase 2 complete, retrospective |

---

## 15. Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|------------|-------|--------|-------------------|
| Supabase database access | DevOps | Ready | Critical - blocks all work |
| Resend account setup | DevOps | Pending | High - blocks email delivery |
| sensor_data historical data | Existing | Ready | Medium - affects testing |
| Admin authentication | Existing | Ready | Critical - blocks API |

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Email deliverability issues | Medium | High | Use reputable provider (Resend), monitor bounce rates |
| Scheduler downtime | Low | High | Implement health checks, alerting, catch-up logic |
| PDF generation performance | Medium | Medium | Cache templates, optimize queries, async generation |
| Timezone bugs | Medium | Medium | Use luxon library, comprehensive testing |
| User adoption low | Medium | Medium | In-app guidance, onboarding emails, presets |

### Contingency Plans

1. **Email provider issues:** Backup provider configured (SendGrid)
2. **Scheduler failure:** Manual trigger endpoint, admin monitoring
3. **Database overload:** Query optimization, read replicas

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| HACCP | Hazard Analysis Critical Control Points - food safety management system |
| GDP | Good Distribution Practice - pharmaceutical distribution guidelines |
| GSP | Good Storage Practice - storage condition guidelines |
| CCP | Critical Control Point - step where control can be applied |
| Excursion | Temperature deviation outside acceptable range |
| Geofence | Virtual geographic boundary |
| TAG | IoT tracking device (temperature, location sensor) |

### B. Related Documents

- Phase 1 PRD: Real-time Chat (Completed)
- UTtag Technical Architecture Document
- Supabase Schema Reference (`supabase-schema.sql`)
- API Authentication Guide (`lib/auth.js`)

### C. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-18 | PM Agent | Initial draft |

### D. Stakeholder Approval

| Role | Name | Approval | Date |
|------|------|----------|------|
| Product Owner | | [ ] Pending | |
| Tech Lead | | [ ] Pending | |
| QA Lead | | [ ] Pending | |
| Design Lead | | [ ] Pending | |

---

*This document is subject to change based on stakeholder feedback and technical discovery.*
