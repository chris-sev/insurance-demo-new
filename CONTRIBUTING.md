# Contributing — Hero Shield Insurance

This is the guide for a human (or an agent helping that human) who needs to
stand up the demo, change it, or deliver it on stage. Secret-by-secret
checklist: [SETUP.md](SETUP.md). What the product does: [README.md](README.md).

**Use these three platforms. Do not invent a fourth.**

| Layer | Use | Do not use |
| ----- | --- | ---------- |
| Database | **Neon** (Lakebase Postgres) via the Neon MCP server | A local Postgres, the Neon console unless MCP is unavailable |
| Auth | **Auth0** (`@auth0/nextjs-auth0` v4, Regular Web App) | Auth.js, Clerk, rolling your own JWT |
| Claims agent | **Vercel AI SDK** + **Vercel AI Gateway** (Anthropic default) | A raw Anthropic / OpenAI SDK, `ANTHROPIC_API_KEY` |

---

## What this app is

A conference-stage insurance demo. Superhero car insurance, and a live
demo of Auth0 for AI agents: one authenticated customer request becomes a
governed chain of work, with every action tied to a responsible identity
and high-value actions crossing a human authority boundary.

1. The audience scans one QR → Auth0 Universal Login → `/join`, where each
   customer submits an amount and a short reason for their claim.
   Unverified emails can submit; only the human approver seat needs a
   verified email.
2. The operator (admin login) opens `/host` and taps **Pick showcase
   request**, a deterministic pick of the room's largest amount (tie
   broken by earliest submission), or a specific request by hand.
3. The **Claims Supervisor** ([lib/agent/supervisor.ts](lib/agent/supervisor.ts))
   runs, in one Vercel AI SDK loop, five named specialist stages as tool
   calls (Policy, Coverage, Risk, Repair, Customer Update), each landing
   live on the projector.
4. Policy code, not the model, decides: at or below $100,000 the claim
   auto-approves; above it, the claim becomes an exception.
5. For an exception, `/host` auto-starts CIBA: one asynchronous approval
   email to the seated human approver (board size 1 by default,
   `requested_expiry=600` so Auth0 uses **email**, not Guardian).
6. Approval, whether by the human approver or automatically under the
   threshold, writes one Token Vault calendar event on the host's Google
   Calendar: `Repair inspection — claim HS-XXXX`.

The original chat path still works: `/file-claim` lets a filer talk to the
claims agent (Hulk smashed a white 2006 Honda Pilot) and confirm
submission the same way it always has; it shows on `/host` whenever no
showcase claim exists.

Every step is a row in Neon. Refresh mid-claim and you resume.

---

## Suggested MCP servers

Install these in Cursor (or your agent host) before you ask an agent to set
the project up.

| MCP | Why |
| --- | --- |
| **Neon** | Create the project, run [db/schema.sql](db/schema.sql), fetch `DATABASE_URL`. SETUP.md tells the agent to drive Neon this way. |
| **Vercel** | Link the project, pull `VERCEL_OIDC_TOKEN` / env, enable AI Gateway. Optional if you mint an `AI_GATEWAY_API_KEY` by hand. |
| **Auth0** (if you have one) | Create the Regular Web App and list tenants. Most Auth0 steps still need the dashboard — CIBA grant, email channel, Token Vault, email templates. |

The agent notes in [AGENTS.md](AGENTS.md) already point here. Do not paste
`.env.local` values into chat.

---

## Agents

Coding agents (Cursor, Claude Code, etc.) should:

1. Read this file and [SETUP.md](SETUP.md) before touching secrets or schema.
2. Provision Neon with the **Neon MCP** (`list_projects` → reuse or
   `create_project` → `run_sql_transaction` of `db/schema.sql` →
   `get_connection_string`). Do not ask the human to click through the
   Neon console unless MCP is missing.
3. Call the claims model through the Vercel AI SDK with a
   `provider/model` string (`anthropic/claude-opus-5` by default). Do not
   add `@anthropic-ai/sdk` or `ANTHROPIC_API_KEY`.
4. Keep CIBA in [lib/ciba.ts](lib/ciba.ts). This app does **not** use
   `@auth0/ai`.
5. Never print a filled-in `.env.local`.

The chat claims agent lives in [lib/agent/](lib/agent/). It is a
`generateText` tool loop (Vercel AI SDK) with three tools:
`save_claim_details`, `notify_fraud`, `publish_claim_submission`. Tools
write Neon; `prepareStep` re-reads the claim so the next turn matches the
database. This backs `/file-claim` only.

The showcase path has its own, separate loop:
[lib/agent/supervisor.ts](lib/agent/supervisor.ts) is the **Claims
Supervisor**, one `generateText` call that makes five tool calls in a
fixed order, one per named specialist stage (`STAGES` in
[lib/types.ts](lib/types.ts)). Each tool call appends one `ClaimStage` row
so the `/host` poll shows live progress. This is honestly **one AI SDK
loop**, never described as five independently running agents. Wrapped in
a 45s `AbortSignal.timeout`; on any error, timeout, or missing stage,
`fillMissingStages` fills the gap with a templated summary built from the
request so the showcase never stalls in front of a room. The decision
(auto-approve vs. exception against `HUMAN_AUTHORITY_THRESHOLD`, $100,000)
is applied by policy code afterward, never by the model.

On stage there is a second kind of “agent”: the presenter. They are an
**admin** if their login email is `@okta.com`, `admin@focusotter.com`, or
listed in the optional `DEMO_ADMIN_EMAILS` env var (comma-separated). On
`/host` they save `demo_host_email` and `demo_host_sub` (sub defaults
to their Auth0 `sub`). That identity is excluded from the approver seat
and is whose Token Vault calendar gets the event. Other admin logins in
the audience can still sit — only the configured demo host is skipped.

---

## Local setup (short)

```bash
pnpm install
cp .env.example .env.local
# required: Auth0 + DATABASE_URL + AI_GATEWAY_API_KEY
pnpm dev
```

`.env.local` **must** include `AI_GATEWAY_API_KEY`. The claims agent will
error in chat without it. Do not add `ANTHROPIC_API_KEY` — this app does
not read it. If you still have an old Anthropic line from before the
gateway refactor, delete it.

Full sequence: [SETUP.md](SETUP.md).

### Vercel AI Gateway

The claims agent routes through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway).
Default model: `anthropic/claude-opus-5` ([lib/agent/model.ts](lib/agent/model.ts)).
Override with `AI_GATEWAY_MODEL`.

**`AI_GATEWAY_API_KEY` is required for local `pnpm dev`.** Create one at
[Vercel AI Gateway API keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys)
and put it in `.env.local`. Restart the dev server after saving.

On a Vercel-linked deploy you can skip the static key and use OIDC
instead (`vercel link`, enable AI Gateway, `vercel env pull .env.local --yes`
writes a ~24h `VERCEL_OIDC_TOKEN`). That is optional for a laptop demo.

---

## Auth0 CIBA (dashboard)

CIBA email is **not on the Free plan**. You need a paid Auth0 plan plus
the AI Agents add-on:

- **Essentials** (or Professional) **+ Auth0 for AI Agents add-on** — the
  add-on is what unlocks **all forms of CIBA** (including email) and
  unlimited Token Vault. On Essentials/Professional, CIBA is add-on
  only. See [Auth0 Pricing](https://auth0.com/pricing).
- Enterprise includes CIBA; email still needs the add-on / AI Agents
  packaging. Do not try this on Free.

The application must be a **first-party, confidential, OIDC-conformant
Regular Web Application** (client secret required). Then:

### 1. Enable the CIBA grant

1. Auth0 Dashboard → **Applications → Applications** → this Regular Web App.
2. **Grant Types** tab → enable
   **Client Initiated Backchannel Authentication (CIBA)**.
3. Save.

### 2. Enable the email notification channel

1. Same application → **Client Initiated Backchannel Authentication (CIBA)**
   section.
2. Enable **email** (you may also enable Guardian push; this demo never
   uses it).
3. Save.

Auth0 picks the channel from `requested_expiry`:

| `requested_expiry` | Channel |
| ------------------ | ------- |
| ≤ 300 seconds | Guardian push (if enabled) |
| 301–259200 seconds | Email (if enabled) |

This app always sends `requested_expiry=600`. If you leave email off, or
send 300, CIBA fails or goes to Guardian. `login_hint` is `iss_sub` (the
board member's Auth0 `sub`), never a raw email. `binding_message` is at
most 64 characters, charset `A-Za-z0-9+-_.,:#`, no spaces. For a
showcase claim it carries the amount (`HeroShield-approve-USD1000000-HS-4A7F`),
falling back to `Hulk-smash-claim-<id>` for a chat-filed claim
([lib/binding-message.ts](lib/binding-message.ts)).

### 3. Email provider and Asynchronous Approval template

1. **Branding → Email Provider** — Auth0's built-in provider is fine for
   rehearsal; production needs your own SMTP/provider.
2. **Branding → Email Templates** → template **Asynchronous Approval**.
   Enable it. The body can use `{{url}}` and `{{binding_message}}`.
3. Every board member must have a **verified** email. Unverified users
   can watch `/join`; they cannot sit.

### 4. Token Vault (host Google Calendar)

Board members do **not** connect Google. Only the demo host does, once,
on `/settings`.

1. Enable Token Vault on the tenant.
2. Add a **Google OAuth 2.0** connection with Calendar scope.
3. Enable that connection on this application.
4. [lib/auth0.ts](lib/auth0.ts) sets `enableConnectAccountEndpoint: true`.
   Audience login is `openid profile email` only.
5. Host clicks **Connect Google Calendar** → `/auth/connect` (admin-gated)
   with `scopes=https://www.googleapis.com/auth/calendar`.

If the host has not connected Google, **CIBA is not sent**. A board yes
with nowhere to write the calendar event is a hollow approval.

---

## Admin vs demo host

| Role | Who | What they can do |
| ---- | --- | ---------------- |
| **Admin** | Login email is `@okta.com`, `admin@focusotter.com`, or listed in `DEMO_ADMIN_EMAILS` | Open `/host` and `/settings`, seat the approver, pick the showcase request, start CIBA, reset |
| **Demo host** | `demo_host_email` / `demo_host_sub` saved on `/host` | Excluded from the approver seat; Token Vault calendar writes only from a session that matches this identity |

On first open of `/host`, the Demo host card (inside **Pre-show
settings**) prefills **sub** with the signed-in admin's Auth0 `sub` and
**email** with their email. Save before you seat an approver. Optional
`DEMO_HOST_EMAIL` / `DEMO_HOST_SUB` in `.env.local` seed the row until
someone saves. `DEMO_ADMIN_EMAILS` is a separate, optional env var that
grants extra logins admin access; it does not affect the demo host
identity.

---

## Stage run-of-show

1. Presenter signs in with an admin email, opens `/host`, expands the
   **Pre-show settings** drawer, saves themselves as demo host, seats the
   human approver, and connects Google on `/settings`.
2. Projector stays on `/host` (intake stage: QR + room counters). Audience
   scans the QR → Auth0 login → `/join` → submits an amount and a reason.
3. Operator taps **Pick showcase request**. `/host` deterministically picks
   the room's largest request and creates the showcase claim.
4. The Claims Supervisor runs its five stages live; the projector shows
   each one land.
5. Above $100,000, `/host` shows the exception panel and auto-starts CIBA:
   one approval email to the seated human approver. At or below, the claim
   auto-approves immediately.
6. Approval (the approver's email tap, or the automatic policy decision)
   shows the outcome panel and schedules the repair inspection on the host
   Google Calendar via Token Vault.

**Start over** (admin only) on `/file-claim` or `/host` wipes the projector
claim, the showcase claim, and the seated approver. **Clear room requests**
(pre-show settings) wipes only the audience's submitted amounts/reasons.
Joiners, board rules, demo host, and Google stay.

---

## Layout

```
app/                  pages + route handlers
app/api/showcase/     POST: pick + run the Claims Supervisor
app/api/join/clear/   POST: wipe room requests
components/           client components (chat, join, host, board) + shadcn/ui
components/stage/     /host stage panels (intake, processing, exception, outcome)
lib/agent/run.ts      chat claims agent tool loop (/file-claim)
lib/agent/supervisor.ts  Claims Supervisor: one loop, five specialist-stage tool calls
lib/ciba.ts           /bc-authorize + CIBA token poll (not @auth0/ai)
lib/ciba-flow.ts      CIBA auto-start, poll, Token Vault calendar write
lib/binding-message.ts  CIBA binding_message, amount-aware for showcase claims
lib/board.ts          joiners, room stats, showcase pick, approver seat
lib/board-config.ts   board rules + demo host identity
lib/host.ts           admin email gate (DEMO_ADMIN_EMAILS)
lib/claims.ts         claim SQL, including the showcase claim lifecycle
lib/auth0.ts          Auth0 client, Token Vault connect-account
lib/types.ts          shared types: STAGES, HUMAN_AUTHORITY_THRESHOLD, Claim, RoomStats
db/schema.sql         claims / messages / joiners / board / ciba / demo_settings
proxy.ts              Auth0 route mounting + page protection
```
