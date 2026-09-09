# Setup

Everything this app needs to run locally: **three sets of secrets** (Auth0, Neon,
Vercel AI Gateway), **one schema migration**, and two Auth0 add-ons the stage
demo depends on — **CIBA email** (`requested_expiry=600`) and **Token Vault**
for the host's Google Calendar. Nothing else — no second app, no build step
beyond `pnpm dev`.

This document is written for a coding agent working with a human who has the
accounts. An agent can do most of this end-to-end; the two things it cannot do
alone are read secrets out of the Auth0 dashboard and mint an AI Gateway key
(unless the project is already `vercel link`ed). Ask for those, don't guess.

Human-facing context (what the app is, suggested MCPs, CIBA dashboard
steps, admin vs demo host): **[CONTRIBUTING.md](CONTRIBUTING.md)**.

> **Never print a filled-in `.env.local` back into the chat, a commit, or a PR
> description.** `.gitignore` already excludes `.env*` except `.env.example`.
> Write values into the file, then confirm which keys are set — not what they are.

---

## 0. Prerequisites

| Tool | Version | Notes |
| ---- | ------- | ----- |
| Node | 22+ | |
| pnpm | 11+ | `packageManager` in `package.json` pins 11.5.0 |
| Neon MCP server | — | how the agent provisions the database (step 2) |
| Auth0 CLI | optional | `brew install auth0/auth0-cli/auth0` — makes step 1 scriptable |
| `psql` | optional | only needed for the non-MCP fallback in step 2 |

```bash
pnpm install
cp .env.example .env.local
```

`.env.local` is where every value below lands. It is read by `next dev` — restart
the dev server after editing it.

---

## 1. Auth0

The app uses `@auth0/nextjs-auth0` v4 with a **server-side session cookie**, so it
needs a **Regular Web Application** — *not* a Single Page Application. A SPA has
no client secret and this app will fail to start without one.

### Option A — Auth0 CLI (agent-runnable)

```bash
auth0 login                                    # opens a browser; the human does this once
auth0 apps create \
  --name "Hero Shield Insurance (local)" \
  --type regular \
  --callbacks "http://localhost:3000/auth/callback" \
  --logout-urls "http://localhost:3000" \
  --reveal-secrets
```

The output carries `CLIENT ID` and `CLIENT SECRET`. Get the tenant domain with
`auth0 tenants list` — use the bare host, e.g. `dev-2zis9k18.us.auth0.com`, with
**no `https://`** prefix.

### Option B — dashboard (ask the human)

Applications → Create Application → **Regular Web Application** → Settings:

- **Allowed Callback URLs**: `http://localhost:3000/auth/callback`
- **Allowed Logout URLs**: `http://localhost:3000`
- **Allowed Web Origins**: `http://localhost:3000`

Then ask the human for Domain, Client ID, and Client Secret from that Settings tab.

### Fill in

```dotenv
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_CLIENT_ID=...
AUTH0_CLIENT_SECRET=...
AUTH0_SECRET=            # generate: openssl rand -hex 32
```

`AUTH0_SECRET` encrypts the session cookie. It is generated locally, not fetched
from Auth0 — an agent can and should just run `openssl rand -hex 32` itself.

### Optional: the `policyId` custom claim

The demo reads a namespaced claim off the session:

```
https://claims.interview-demo.com/policyId
```

Add a post-login Action to set it if you want a stable policy number per user:

```js
exports.onExecutePostLogin = async (event, api) => {
  api.idToken.setCustomClaim(
    'https://claims.interview-demo.com/policyId',
    'POL-2026-12345',
  )
}
```

Without the Action nothing breaks — [lib/auth0.ts](lib/auth0.ts) falls back to
`generatePolicyId()` and makes one up per claim.

`AUTH0_AUDIENCE` in `.env.example` stays commented out. It is only needed if you
want an access token for a *separate* API; this app has none.

**Admin access** is email-based, not env-based. A login whose email is
`@okta.com` or `admin@focusotter.com` can open `/host` and `/settings`.
On `/host` they save **demo host** email + Auth0 `sub` (sub defaults to
their own). That identity is excluded from the board; calendar writes
require the current session `sub` to match the saved demo host sub.
`DEMO_HOST_EMAIL` / `DEMO_HOST_SUB` in `.env.local` are an optional seed
until someone saves on `/host`.

### Board size and CIBA yes threshold

Code and seed default is **pick 1 / 1 yes**. Focus raises them on **`/host` →
Board rules** for the stage talk (typically 6 / 3). The values persist in
Neon `demo_settings` (not env). An existing singleton row is rewritten to
1 / 1 once (`defaults_version`) so a live DB does not keep the old 6 / 3
seed on first load; a later host save of 6 / 3 is kept. Threshold must be
≥ 1 and ≤ board size.

The host console shows `N/{size}` and disables Pick until verified (non-host)
joiners ≥ the saved size. The configured demo host (saved on `/host`)
is never seated. `POST /api/board/pick` replaces the current board until CIBA
is live and rejects a short room. CIBA start emails only seated joiner `sub`s
(`login_hint` `iss_sub`) and refuses a board that is empty, host-only, or not
exactly the saved size. Calendar write and `claim.status = approved` fire only
after yeses ≥ the saved threshold.

### CIBA email grant

CIBA email is not on the Free plan. You need **Essentials (or
Professional) + the Auth0 for AI Agents add-on**. Dashboard steps —
grant type, email channel, Asynchronous Approval template — are in
[CONTRIBUTING.md](CONTRIBUTING.md#auth0-ciba-dashboard). The loop lives
in [lib/ciba.ts](lib/ciba.ts), copied from
[mtliendo/ciba-email](https://github.com/mtliendo/ciba-email) — we do **not**
use `@auth0/ai`.

Auth0 picks the channel from `requested_expiry`:

- **300 seconds or less:** Guardian push
- **301 to 259200 seconds:** email

This demo always sends `requested_expiry=600`. `login_hint` is `iss_sub` (that
board member's Auth0 `sub`), never a raw email. `binding_message` is at most
64 characters, charset `A-Za-z0-9+-_.,:#`, no spaces
(`Hulk-smash-claim-<id>`). The authorizing user must have a **verified**
email or they cannot sit on the board.

### Token Vault — host Google Calendar only

Board members do **not** connect Google. Only the host (Focus) does,
once, on `/settings`.

Follow the pattern in
[mtliendo/auth0-calendar-workshop](https://github.com/mtliendo/auth0-calendar-workshop):

1. Enable Token Vault on the tenant and add a **Google OAuth 2.0** connection
   with Calendar scope.
2. Enable that connection on this application.
3. [lib/auth0.ts](lib/auth0.ts) sets `enableConnectAccountEndpoint: true`.
   Login scope is `openid profile email` only — **no Google calendar
   scope** and **no `offline_access`** on audience Universal Login. Host
   Calendar is host-only `/auth/connect`.
4. Host clicks **Connect Google Calendar** → `/auth/connect` (proxy-gated to
   the host) with `scopes=https://www.googleapis.com/auth/calendar`.
5. After CIBA yeses hit the saved threshold the **host session** calls
   `auth0.getAccessTokenForConnection({ connection: 'google-oauth2' })` and
   writes Calendar REST ([lib/google-calendar.ts](lib/google-calendar.ts)).
   A non-host poller does not write. There is no public `POST /api/calendar`.

If the host has not connected Google, **CIBA is not sent**. The host console
says so. A board yes with nowhere to write the calendar event is a hollow
approval.

---

## 2. Neon database (use the Neon MCP server)

The agent should drive this with the **Neon MCP server** rather than asking the
human to click through the console. The full sequence:

1. **`list_projects`** — reuse an existing project if one obviously fits;
   otherwise create.
2. **`create_project`** with name `insurance-demo`. Note the returned project ID.
3. **`run_sql_transaction`** against that project's `main` branch, passing the
   statements from [db/schema.sql](db/schema.sql). Read the file and pass each
   `create table` / `create index` as a separate statement in the array — the
   file is idempotent (`if not exists` throughout), so re-running is safe.
4. **`get_connection_string`** for the project's `main` branch and database
   `neondb`. Write the result into `.env.local` as `DATABASE_URL`.
5. **`get_database_tables`** to verify. Expect `claims`, `messages`,
   `claim_approvals`, `demo_joiners`, `board_picks`, `board_members`,
   `ciba_authorizations`, `demo_settings`.

```dotenv
DATABASE_URL=postgresql://...@ep-....neon.tech/neondb?sslmode=require
```

The connection string **must** keep `?sslmode=require` — `@neondatabase/serverless`
talks to Neon's pooled HTTP endpoint and the driver expects it.

### Fallback without MCP

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

### What the schema is for

| Table | Replaces | Role |
| ----- | -------- | ---- |
| `claims` | DynamoDB `claims` | One row per claim; `status` drives the whole demo. CIBA start freezes `ciba_board_size` / `ciba_yes_threshold`. |
| `messages` | DynamoDB `messages` | Chat transcript, so a refresh resumes the claim |
| `claim_approvals` | AppSync `CLAIM_APPROVAL` events | Unused leftover; cascades on claim delete |
| `demo_joiners` | — | QR joiners (`sub`, email, name, verified, pinned) |
| `board_picks` / `board_members` | — | Latest pick of the saved size |
| `ciba_authorizations` | — | `{authReqId, sub, email, name, status}` per seat |
| `demo_settings` | — | Host-saved board size, CIBA yes threshold (default 1 / 1), and demo host email/sub |

---

## 3. Vercel AI Gateway

Drives the claims agent in [lib/agent/](lib/agent/) through the Vercel AI
SDK. Default model is `anthropic/claude-opus-5`. Do not set
`ANTHROPIC_API_KEY` — that bypasses the gateway.

**Option A — OIDC (Vercel-linked project)**

```bash
vercel link
# Enable AI Gateway on the Vercel project settings
vercel env pull .env.local --yes   # writes VERCEL_OIDC_TOKEN (~24h)
```

**Option B — static key (ask the human)**

Create a key at
[vercel.com/…/ai-gateway/api-keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys):

```dotenv
AI_GATEWAY_API_KEY=
# optional:
# AI_GATEWAY_MODEL=anthropic/claude-opus-5
```

A `401`/`400` from the chat route shows up in the UI as *"Sorry, I
encountered an error."* and in the server log as `Agent error:`.

---

## 4. Verify

```bash
pnpm build    # typechecks + builds; catches missing config that isn't env-dependent
pnpm dev
```

Then walk the happy path:

1. `http://localhost:3000` → **Login** → Auth0 Universal Login. A redirect loop
   or a callback error here is almost always a mismatched Allowed Callback URL.
2. `/settings` → **Connect Google Calendar** (host only). Without this, CIBA
   emails are withheld.
3. `/host` → QR is on screen. A second browser opens `/join`, logs in with a
   **verified** email, and waits.
4. **Pick board.** Pick replaces the current board until CIBA is live.
   The joiner phone shows "you're on the board." The host is never seated.
5. `/file-claim` → describe the Hulk incident. Confirm submission. The
   filer session does not start CIBA (`startCibaForSubmittedClaim`
   requires the host). With `/host` open, `GET /api/board` calls the same
   `startCibaForSubmittedClaim` as `POST /api/ciba`. If start is blocked
   (no Google, no/short board, already live, Auth0), the agent says the
   operator console will start it. Host **Send CIBA** is only a fallback
   when auto-start failed. Emails go out to the seated board
   (`requested_expiry=600`). The projector ticks as they Accept.
6. Yeses ≥ the saved threshold → claim `approved`, confetti, calendar event
   on the host Google account. CIBA board yeses are the grant.

### Troubleshooting

| Symptom | Cause |
| ------- | ----- |
| `DATABASE_URL is not set. Copy .env.example to .env.local.` | `.env.local` missing or dev server not restarted after editing it |
| Redirect loop at `/auth/login` | `APP_BASE_URL` doesn't match the URL you're browsing, or `AUTH0_SECRET` is missing/short |
| `Callback URL mismatch` from Auth0 | Allowed Callback URL must be exactly `http://localhost:3000/auth/callback` |
| Sign-in works but every page 401s | App created as a SPA — recreate it as a Regular Web Application |
| Agent replies "Sorry, I encountered an error" | Missing/expired `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`; check the server log for `Agent error:` |
| `relation "claims" does not exist` | Step 2's migration never ran against the branch this `DATABASE_URL` points at |
| Approvals never release the claim | Need the host-saved yes threshold (default 1) from the seated board (default 1). Raise both on `/host` for the talk. |
| Host console 403 / redirected to /join | Login email is not `@okta.com` or `admin@focusotter.com` |
| CIBA emails never send | `/host` is not open (auto-start is the host poll), host has not connected Google, no board picked, leftover host-only seat, or `requested_expiry` is ≤300 (Guardian) |
| CIBA emailed the presenter | Demo host not saved on `/host`, or leftover `board_members` row; Start over clears the seated board |
| Auth0 `slow_down` on stage | Polls must honor stored `interval_sec` (floor 5). Do not reset after `authorization_pending`. |
| Board member missing from pick | Email not verified on the Auth0 user, or they are the configured host |
| Calendar event missing after the threshold yeses | Token Vault Google connection dropped; reconnect on `/settings` |

---

## Reset between demos

**Start over (host only).** On `/file-claim` or `/host`, Focus taps **Start
over** and confirms. That deletes the claim the projector is showing —
every `awaiting_approval` or `approved` row, **including approved +
`calendar_event_id`** — plus the host's latest unapproved chat **and
the seated board** (`board_picks` / `board_members`). Leftover host
seats are why CIBA mailed the operator. Cascades `messages`,
`ciba_authorizations`, and leftover `claim_approvals`. Does **not**
delete the Google Calendar event. Joiners, `demo_settings`, Token Vault
/ Google, and Auth0 users stay. Audience and joiners cannot call this;
`POST /api/claims/reset` is host-gated.

**Full room wipe** (joiners and board too) via Neon MCP `run_sql`, or:

```sql
truncate claims, demo_joiners, board_picks cascade;
```

`ciba_authorizations`, `messages`, `claim_approvals`, and `board_members`
cascade from those. Do not expose a public clear to non-hosts.
