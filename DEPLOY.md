# UTtag — Deploy & Demo Guide

One-page reference for bringing a fresh machine (or a CI runner) up to "client demo ready" state.

---

## 1. Prerequisites

- Node.js ≥ 18 (uses built-in `node --test`)
- A Supabase project (URL + service role key)
- Optional: Resend account for invite / report emails; Firebase for push

---

## 2. Environment

Copy the template and fill in real values:

```bash
cp .env.example .env.local
```

Required:

| Key | Why |
|---|---|
| `SUPABASE_URL` | https://xxxx.supabase.co |
| `SUPABASE_SERVICE_KEY` | service role key — server bypasses RLS |
| `JWT_SECRET` | ≥ 32 chars, random — signs admin + tenant tokens |

Recommended for production:

| Key | Default | Why |
|---|---|---|
| `NODE_ENV=production` | — | CORS fails closed, 5xx messages masked |
| `ALLOWED_ORIGINS` | — | CSV of allowed origins; without it prod blocks all cross-origin |
| `APP_URL` | `http://localhost:3030` | Used in reset / invite email links |
| `RESEND_API_KEY` + `EMAIL_FROM` | — | No emails without these |

---

## 3. Database migrations

Run in order in the Supabase SQL editor (each file is idempotent):

1. `supabase-schema.sql`                              — baseline
2. `supabase-migration-phase5-industry.sql`           — industry vertical + admin lockout fields
3. `supabase-migration-phase5b-rls.sql`               — RLS policies (defense-in-depth)
4. `supabase-migration-phase5c-tenant-alerts.sql`     — `tenant_alerts` table
5. `supabase-migration-phase5d-scheduler-lock.sql`    — `claim_due_schedule()` for multi-instance safety
6. `supabase-migration-phase5e-password-reset.sql`    — `reset_token` columns

---

## 4. Install & start

```bash
npm install
npm run preflight       # env + DB smoke check — refuses to exit 0 if anything is off
npm run seed:demo       # two demo tenants + six users + seeded alerts
npm start               # http://localhost:3030
```

`npm run preflight` is idempotent and safe in CI. Wire it into `systemd`/PM2 pre-start.

---

## 5. Demo URLs

| Path | Purpose |
|---|---|
| `/` | Admin app (superadmin only — app.js, 8600 lines) |
| `/tenant-login.html` | Tenant user login |
| `/tenant.html` | Per-tenant dashboard (Dashboard / Alerts / Users / Profile) |
| `/admin-impersonate.html` | Superadmin → "open as <tenant user>" wizard (15-min token) |
| `/password-forgot.html` + `/password-reset.html` | Self-service password reset |
| `/invite-accept.html` | Activation page for invited users (arrives by email) |

---

## 6. Demo accounts (password = `demopass` for all)

| Email | Tenant | Role | Sees |
|---|---|---|---|
| `admin@coldchain.demo`    | 冷鏈 Demo 客戶 | admin    | Full fields + "+ 新增成員" button + branding editor |
| `operator@coldchain.demo` | 冷鏈 Demo 客戶 | operator | name/email/role/status (no phone, no last_login) |
| `viewer@coldchain.demo`   | 冷鏈 Demo 客戶 | user     | name + role only |
| `admin@biomed.demo`       | 生醫 Demo 客戶 | admin    | Same as cold-chain admin, different device set (BM:*) |
| `operator@biomed.demo`    | 生醫 Demo 客戶 | operator | |
| `viewer@biomed.demo`      | 生醫 Demo 客戶 | user     | |

Regenerate any time with `npm run seed:demo`. Add `--wipe` to delete first.

---

## 7. Test

```bash
npm test
```

Currently 48 tests / 28 suites / all pass. Covers: field visibility, industry gate, admin lockout + timing path, CORS fail-closed matrix, impersonation token TTL/claims, alert derivation, password-flow happy + failure paths, dual-auth both kinds and failure modes.

Set `JWT_SECRET` before running. The harness stubs Supabase for most suites.

---

## 8. Demo script (recommended 10-minute flow)

1. **Tenant view** — open `/tenant-login.html`, log in as `admin@coldchain.demo`. Show Dashboard (CC:* devices), switch to Alerts (live thresholds), Users (full fields), Profile (branding editor).
2. **Role difference** — log out, log in as `viewer@coldchain.demo`. Users tab now shows only name + role. "+ 新增成員" button is gone.
3. **Industry gate** — log out, visit `/?industry=biomedical`. Cold-chain / logistics panels disappear. Visit `/?industry=cold_chain` — they reappear.
4. **Impersonation** — open `/admin-impersonate.html`, log in as superadmin, pick a tenant, pick a user → tenant.html opens with yellow banner showing "由 admin X 代入中". Click 結束代入 to return.
5. **Alerts lighting up** — seed readings include out-of-bounds values so Alerts tab is non-empty on first load.

---

## 9. Branching & merge workflow

- All work commits to atomic units on `main`.
- Push feature branches (`feat/...`) and open PRs — do **not** use `--delete-branch` on a stacked-PR base; it orphans upper PRs.
- `rebase-merge` is the house style (linear history, no merge commits).

---

## 10. Known deferred work

| Item | Notes |
|---|---|
| S5 full RLS | Backend still uses `SUPABASE_SERVICE_KEY` which bypasses RLS. Policies are in place as safety net. Full enforcement requires switching to per-request user-scoped Supabase clients — separate sprint. |
| Mobile E2E | No Maestro/Detox harness yet. Backend endpoints are ready under `/api/mobile/*`. |
| Scheduler token bootstrap | `IMPERSONATE_TTL=900` is the demo default (15 min). Set higher only for demo boxes; never in prod. |
