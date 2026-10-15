# Valencia RMS – Audit, Hardening & Deployment Report

Branch: `optimize/audit-hardening` (not merged, not deployed).
Stack found: React 18 + Vite 6 (frontend), Node/Express 4 + mysql2 pool (backend), MySQL 8, JWT auth, nodemailer, node-cron.
Hosting (observed): frontend static at `myvol.in` (Hostinger, brotli + 7-day asset cache, SPA fallback works);
API at `blanchedalmond-turkey-793003.hostingersite.com` (Hostinger Node app). The Hostinger account itself was
**not accessible** (connector unauthorised), so plan type, env vars, logs and backups are **unverified**.

## A. Findings and what was done

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | Critical | Login signed JWTs with hard-coded fallback secret `valencia_rms_secret_key` | Fixed – server now refuses to start without `JWT_SECRET` |
| 2 | High | `/api/db-test` was public and returned the production database name | Fixed – returns only `{success}` |
| 3 | High | No brute-force protection on login | Fixed – 10 attempts / 15 min per IP+email, plus 100 / 15 min per IP (429 + Retry-After) |
| 4 | High | 242 handlers return `error.message` / `sqlMessage` to clients | Fixed centrally in production (stripped from every 5xx; `requestId` returned instead) |
| 5 | High | nodemailer 6.x: 15 advisories (header/SMTP injection, recipient-domain bypass, DoS) | Fixed – upgraded to 10.1.1, offline send verified |
| 6 | Medium | Other vulnerable deps (react-router etc.) | Fixed via non-breaking `npm audit fix` |
| 7 | Medium | Import uploads (`/administrator/*/import`) had no file-type filter | Fixed – xlsx/xls/csv only (matches HR route) |
| 8 | Medium | No security headers, `X-Powered-By` exposed | Fixed (nosniff, X-Frame-Options, HSTS, Referrer-Policy) |
| 9 | Medium | No request id / slow-request log; bad JSON & CORS rejections returned HTML 500 | Fixed – request id, >1s/5xx logging, JSON 400/403/413 via central handler |
| 10 | Medium | No graceful shutdown / unhandled-rejection logging | Fixed |
| 11 | High (perf) | Entire frontend shipped as one 1.9 MB JS bundle | Fixed – route-level lazy loading |
| 12 | Info | Calendar 403s, missing routes, localhost API fallback | Fixed earlier (commit c68f2d0) |

## B. Files changed
- `backend/src/middleware/hardening.js` (new) – headers, request id, error stripping, rate limiter, error handler
- `backend/src/server.js` – JWT_SECRET guard, trust proxy, middleware wiring, login limiter, db-test, error handler, shutdown
- `backend/src/controllers/authcontroller.js` – removed fallback secret
- `backend/src/routes/administratorroutes.js` – upload file filter
- `backend/test/smoke.test.js` (new), `backend/package.json` (`npm test`), `.github/workflows/ci.yml` (runs tests)
- `frontend/src/App.jsx` – `React.lazy` + `Suspense` for 44 pages/layouts
- `backend/package*.json`, `frontend/package-lock.json` – nodemailer 10.1.1 and audit fixes
- No dependencies added. No database schema changes. No files deleted.

## C. Tests actually run
- `npm test --prefix backend` → **7/7 pass**: refuses start without secret; headers; db-test no disclosure;
  404/400/403 JSON; **every route except login and leave-review requires auth**; login rate limit; no SQL leak in prod errors.
- `vite build` passes. Production build served locally and opened in a browser: login page renders with no console errors;
  admin layout + overview load their lazy chunks and render.
- Valid-origin CORS preflight (`https://myvol.in`) still returns correct headers.
- **Not run:** authenticated end-to-end flows (no test credentials; the frontend API URL is hard-coded to production),
  file upload/download, role-by-role UI walkthrough, mobile layout review, load test, concurrency tests.

## D. Measurements (same machine, before → after)
| Metric | Before | After |
|---|---|---|
| Entry JS (minified) | 1,926 kB (gzip 506 kB) | 252 kB (gzip 84 kB) |
| Entry CSS | 453 kB (gzip 62 kB) | 37 kB (rest loads per page) |
| Login page transfer (browser) | – | ~85 kB JS + 7 kB CSS |
| Total CSS across all chunks | 453 kB | 494 kB (some rules duplicated across chunks; only loaded on demand) |
| API p50/p95 local (`/api/health`, n=60) | 0.5 / 1.6 ms | 0.5 / 1.8 ms (no regression) |
| `/api/auth/me` 401 p50/p95 | 0.4 / 0.8 ms | 0.4 / 0.9 ms |
Not measurable here: LCP/INP/CLS (no field data, would need Lighthouse on the deployed site), DB query times under real
load (local DB is a small dev copy: ~2k attendance rows, and is missing the chat/field-visit tables).

## E. Left unresolved (and why)
1. **`xlsx` has known vulnerabilities with no upstream fix.** Used only on authenticated admin/HR imports (≤10 MB, extension-filtered).
   Real fix = replace with `exceljs`; deferred, needs import regression testing.
2. `node-cron` → transitive `uuid` advisory: not exploitable (no buffer argument used); upgrade to v4 is breaking, deferred.
3. **Missing backend code for existing UI:** `/superadmin/projects/assign|:id/context|:id/assignees|:id/tasks|DELETE :id` and
   `/superadmin/users/import`, plus the Vendor Management module, have no backend in git. Need the original files.
4. JWTs last 7 days, live in browser storage, and cannot be revoked server-side (XSS-theft risk). Recommend shorter expiry + refresh.
5. SMTP TLS certificate verification defaults to **off** (`SMTP_TLS_REJECT_UNAUTHORIZED`). Set it to `true` if the mail server has a valid cert.
6. Production CORS list still includes `localhost:5173/5174` (developers use them against the live API). Remove once a staging API exists.
7. Resource-level (IDOR) authorization was not audited across ~190 routes – only route-level role checks were verified.
   Highest-risk to review first: employee task/attendance/leave endpoints that take an id from the URL.
8. Server-side pagination: not changed. Largest screens (`adminProjects` 140 kB, attendance, reports) fetch full lists; fine at
   ~120 users, revisit at scale. Candidate DB index when data grows: `attendance(attendance_date)`.
9. In-memory rate limiter is per process (fine for a single Node instance).

## F. Deployment package (Hostinger) — verify each item in hPanel first
**Prerequisites**
- hPanel access (Node.js app + database + backups). Node 20+.
- **`JWT_SECRET` must be set in the Node app's environment variables BEFORE deploying this version** – the app now exits on start without it (previously it would have been unusable anyway for authenticated calls). Use a long random value; changing it logs everyone out.
- Other env (example values only): `NODE_ENV=production`, `PORT` (as provided by Hostinger), `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL=false`, `EMAIL_ENABLED`, `SMTP_*`, `FRONTEND_URL=https://myvol.in`.
- Note: if the Hostinger DB host is `localhost`, Hostinger's own guidance is to use `127.0.0.1` for Node.

**Before deploying**: take a database backup (hPanel → Databases/Backups) and keep the current deployed frontend `dist` + backend files as a copy.
No database migration is required for this release.

**Deploy**
1. Review/merge branch `optimize/audit-hardening`. NOTE: pushing to `main` triggers `.github/workflows/deploy.yml` (GitHub Pages build of the frontend). Confirm Pages is not what serves `myvol.in` before relying on it.
2. Backend: update the Node app (Git deploy or upload), `npm ci --omit=dev`, restart from hPanel.
3. Frontend: `npm ci && npm run build --prefix frontend`, upload `frontend/dist/*` to the site root (replace old `assets`).

**Smoke tests** (after deploy)
- `GET /api/health` → 200 with `X-Request-Id`; `GET /api/db-test` → `{"success":true}` only.
- Log in as each role (employee, admin, administrator, superadmin); open Overview and Calendar for each (no 403).
- Refresh a deep link (e.g. `/admin/calendar`) → page loads. Wrong password 11× for one email → 429.
- Check Node logs for startup line `Server running` and no `FATAL`.

**Rollback**: redeploy the saved previous backend files + previous `dist`, restart the Node app. No schema change, so no DB rollback needed.
