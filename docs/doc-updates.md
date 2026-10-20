# BIX Submission Docs — Copy-Paste Update Sheet

Verified against the live codebase (fresh test run + grep checks) on 2026-10-20.
Each block below is ready to paste in place of the matching section/table in the
PDF it names. Where it's a table, the full replacement table is given rather than
a diff, so you can just swap it in whole.

---

## 1. Test Documentation

### Section 2 — Coverage Summary table (replace the whole table)

| Suite | Test files | Tests passing | Tests skipped |
|---|---|---|---|
| Backend (server/) | 69 (66 run + 3 opt-in) | 1,074 | 14 (three opt-in Postgres-integration suites — `us08c.integration.test.js`, `projectAnalytics.integration.test.js`, `analytics.integration.test.js` — gated behind env flags, requiring a real Postgres instance; intentionally opt-in, not neglected) |
| Frontend (client/) | 50 | 436 | 0 |
| **Total** | **119** | **1,510** | **14** |

### Section 2 — Coverage by area table (add this row)

| Area | Coverage |
|---|---|
| Team membership management (closing a mock-data gap) | 18 backend controller tests + 5 route-wiring tests + 10 frontend `TeamDetail` tests + 6 `api.js` service tests, mirroring the existing project-membership pattern |

### Section 3 — Defect Log (add this entry)

**D-12 Medium**

| | |
|---|---|
| Title | TeamDetail and the Admin sidebar's team list were entirely mock data, disconnected from the real database |
| What was tested/reviewed | A dedicated mock-data audit checking every page's displayed data genuinely came from the database rather than a static fixture file. |
| How it was found | `TeamDetail.jsx` and `AdminSidebar.jsx` both imported from `client/src/data/orgMockData.js` and rendered it unlabelled, as if it were real. A working, fully-tested `teamModel.js` already existed in the backend, but no controller or route had ever been built on top of it, so there was no way for the frontend to reach real team data even though the model layer was ready. |
| Resolution | Built the missing `teamController.js` and `teamRoutes.js` (mirroring the existing project-membership controller/routes exactly, admin-only), then rewired `AdminSidebar.jsx` and rebuilt `TeamDetail.jsx` to fetch real data. Two UI elements that implied data the schema doesn't track — a team's "current project"/status pill and "assigned elsewhere" cross-team exclusivity — were deliberately dropped rather than faked, since no team-to-project link or exclusivity rule exists anywhere else in the app. |
| Verification | 39 new tests (18 backend controller + 5 route-wiring + 10 `TeamDetail` frontend + 6 `api.js` service); full suites re-run clean. |

Optional additions — these are infra/deployment fixes rather than application code defects, but found and resolved the same way (deliberate testing, not luck), so you may want them in the log too:

**D-13 Medium (optional)**

| | |
|---|---|
| Title | Demo password-reset mailbox would have exposed any user's reset link if shipped as-is |
| What was tested/reviewed | Pre-deployment security review of what ships to production. |
| How it was found | The demo mailbox (built for local development, since local dev has no real email provider) is an unauthenticated page/endpoint that returns the most recent password-reset message, including its token-bearing link. Nothing stopped it being live in production. |
| Resolution | Gated the route (`server/src/routes/authRoutes.js`) and the frontend route/link (`client/src/App.jsx`, `ForgotPassword.jsx`) behind `DEMO_MAILBOX_ENABLED` / `VITE_DEMO_MAILBOX_ENABLED`, both off by default/unset in the deployed environment. |
| Verification | Updated test suites for both flag states; confirmed via `grep` on the production build output that no reference to the demo mailbox route or UI text ships in the deployed JS bundle. |

**D-14 Medium (optional)**

| | |
|---|---|
| Title | Password reset emails never arrived once deployed |
| What was tested/reviewed | End-to-end verification of the deployed Forgot Password flow, as required before treating a deployment as release-ready. |
| How it was found | Render logs showed `Connection timeout` on both SMTP ports (465 and 587) tried — the host blocks outbound SMTP platform-wide, which a credential problem would not produce (a bad password rejects quickly after connecting; this never connected at all). |
| Resolution | Replaced the SMTP transport (`nodemailer`) with Brevo's HTTP transactional-email API (`POST https://api.brevo.com/v3/smtp/email`), which runs over port 443 and isn't blocked. |
| Verification | Rewrote `emailSender.test.js` to mock `fetch` instead of `nodemailer`; confirmed live via Brevo's own activity log and a real email received end-to-end, including the reset link working after a related SPA-routing fix. |

### Section 5 — Known Limitations (replace the bullet list)

Remove these four — all built since the doc was written:
- ~~US-13a / US-13b (Analytics by Project / by Sprint): not implemented~~
- ~~US-09 (Tag Scrum Master and Product Owner): not implemented at the data layer~~
- ~~US-07 (Current Focus Highlight): no feature under this name exists~~
- ~~"Team" management: team creation and team-level developer assignment still have no backend route~~

Keep, but reword NFR-02 (it's now partial, not absent):

> **NFR-02 (Performance Efficiency Baseline): partially addressed.** The heaviest pages — Burndown, Sprint Analytics, Project Analytics — are now lazy-loaded/code-split (`React.lazy` in `App.jsx`), so they no longer add to the initial bundle. No list endpoint (PBIs, tasks, history, dashboard) has pagination or a caching layer yet. Acceptable at current demo scale; still the next priority if data volume grows.

Keep unchanged:
- No CI pipeline — the opt-in Postgres integration suites still only run when a developer manually sets the relevant env flag.

### Section 4 — Target Quality Metrics (update the defect-count row)

> **Overall defect count:** 12 defects found and resolved (D-01 to D-12), plus 1 formal review producing no defect. 0 remain open.
> *(13 or 14 if you include D-13 and/or D-14 above — adjust the number to match whichever entries you actually add.)*

---

## 2. Technical Guide

### Section 7 — Deployment (replace the entire section)

> ## 7. Deployment
>
> BIX is deployed and live. The deployment consists of three Render services plus a transactional-email provider, connected as follows:
>
> | Component | Platform | Notes |
> |---|---|---|
> | Backend API | Render Web Service (`bix-server`) | Root dir `server`, build `npm install`, start `npm start` |
> | Database | Render managed PostgreSQL | `DATABASE_SSL` enabled for the connection |
> | Frontend | Render Static Site (`bix-client`) | Root dir `client`, build `npm run build`, publish dir `dist` |
> | Transactional email | Brevo (HTTP API) | Used instead of SMTP because Render blocks outbound SMTP on both port 465 and 587 |
>
> **Repository note:** the canonical repository lives on Monash's self-hosted GitLab instance, which Render's GitLab OAuth integration cannot reach (it only supports gitlab.com). A GitHub mirror is used solely to satisfy Render's connector; every change must be pushed to both remotes (`git push origin main && git push github main`) to actually reach the deployed app.
>
> **SPA routing:** a Render Redirects/Rewrites rule (`/*` → `/index.html`, action **Rewrite**) is required on the static site so client-side routes like `/reset-password` resolve correctly on direct navigation/page refresh, rather than 404ing as a missing static file.
>
> **Environment variables set on the deployed backend:** `DATABASE_URL`, `DATABASE_SSL`, `JWT_SECRET` (real, non-default), `JWT_EXPIRES_IN`, `CORS_ORIGIN` and `APP_ORIGIN` (both set to the deployed frontend's public URL), `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`. `DEMO_MAILBOX_ENABLED` is left unset in production (default off).
>
> **Environment variables set on the deployed frontend build:** `VITE_API_BASE_URL` (the deployed backend's public URL). `VITE_DEMO_MAILBOX_ENABLED` is left unset (default off).
>
> The deployed login flow, a protected page, and the Forgot Password → real email → reset-link flow have all been verified end-to-end against the live deployment.

### Section 4 — Configuration Reference (add these rows to the Backend table)

| Variable | Purpose |
|---|---|
| DATABASE_SSL | Enables SSL on the Postgres connection; required by most managed Postgres hosts (e.g. Render). |
| BREVO_API_KEY | API key for Brevo's transactional-email HTTP API, used to send password-reset emails. |
| BREVO_SENDER_EMAIL | The "from" address password-reset emails are sent from via Brevo. |
| DEMO_MAILBOX_ENABLED | Opt-in flag that exposes a local-dev-only endpoint for reading the most recent password-reset message without real email. Must stay unset in any deployed environment. |

Add this row to the Frontend table:

| Variable | Purpose |
|---|---|
| VITE_DEMO_MAILBOX_ENABLED | Shows the demo inbox page and its link from Forgot Password. Must match the backend's `DEMO_MAILBOX_ENABLED`, and must stay unset in any deployed build. |

### Section 9 — Known Limitations (replace the bullet list)

Remove these three — all built since the doc was written:
- ~~No Analytics pages (by Project or by Sprint)~~
- ~~No schema or route support for tagging a Scrum Master or Product Owner on a project~~
- ~~No React error boundary around the app~~

Keep, but reword NFR-02 the same way as in the Test Documentation:

> No pagination or caching on any list endpoint or page (NFR-02, Performance) — acceptable at current data volumes. Note: the heaviest pages (Burndown, Sprint/Project Analytics) are already lazy-loaded via code-splitting; pagination/caching on list endpoints is the remaining gap.

Keep unchanged:
- No CI pipeline enforcing tests before merge; the Postgres integration suites only run when a developer manually opts in.

---

## 3. User Guide

### Section 3 — "Team Health and Burndown" paragraph (replace)

Old:
> A project's Burndown page shows remaining work across the active Sprint. Selecting a team from your Dashboard or sidebar opens that team's detail page, showing its members and the projects they are working on.

New:
> A project's Burndown page shows remaining work across the active Sprint. Selecting a team from your Dashboard or sidebar opens that team's detail page, showing its members.

### Section 7 — Known Limitations (replace the paragraph)

Old:
> The following are not available in this release and are planned as future work, not defects: project/Sprint analytics dashboards, formally tagging a Scrum Master or Product Owner on a project, and a dedicated "current focus" highlight beyond the existing "my cards" filter and urgency badges.

New:
> This release has no known functional limitations beyond standard scale considerations (no pagination on very large lists yet).

(Project/Sprint analytics, Scrum Master/Product Owner tagging, and a current-focus highlight are all now real, usable features — the first two described in section 3, and current focus shown as a banner on the board alongside the existing "my cards" filter and urgency badges.)
