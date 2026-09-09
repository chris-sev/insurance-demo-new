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

A conference-stage insurance demo. Superhero car insurance.

1. The presenter opens `/host` on the projector (admin window) and `/file-claim`
   in a second window (the person filing).
2. The audience scans a QR → Auth0 Universal Login → `/join`. Verified emails
   can sit on the CIBA board.
3. The presenter picks a board of N verified joiners (default 1; raise to 6
   for the talk). The configured demo host is never seated.
4. The filer chats with the claims agent (Hulk smashed a white 2006 Honda
   Pilot). Confirm submission flips the claim to `awaiting_approval`.
5. With `/host` open, CIBA emails go to the seated board
   (`requested_expiry=600` so Auth0 uses **email**, not Guardian). Board
   members approve on their phones.
6. Yeses at the saved threshold approve the claim, fire confetti, and write
   one event on the presenter's Google Calendar via Auth0 Token Vault.

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

The claims agent itself lives in [lib/agent/](lib/agent/). It is a
`generateText` tool loop (Vercel AI SDK) with three tools:
`save_claim_details`, `notify_fraud`, `publish_claim_submission`. Tools
write Neon; `prepareStep` re-reads the claim so the next turn matches the
database.

On stage there is a second kind of “agent”: the presenter. They are an
**admin** if their login email is `@okta.com` or `admin@focusotter.com`.
On `/host` they save `demo_host_email` and `demo_host_sub` (sub defaults
to their Auth0 `sub`). That identity is excluded from the board and is
whose Token Vault calendar gets the event. Other `@okta.com` people in
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
most 64 characters, charset `A-Za-z0-9+-_.,:#`, no spaces
(`Hulk-smash-claim-<id>`).

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
| **Admin** | Login email is `@okta.com` or `admin@focusotter.com` | Open `/host` and `/settings`, pick the board, start CIBA, reset the claim |
| **Demo host** | `demo_host_email` / `demo_host_sub` saved on `/host` | Excluded from the board; Token Vault calendar writes only from a session that matches this identity |

On first open of `/host`, the Demo host card prefills **sub** with the
signed-in admin's Auth0 `sub` and **email** with their email. Save before
you pick a board. Optional `DEMO_HOST_EMAIL` / `DEMO_HOST_SUB` in
`.env.local` seed the row until someone saves.

---

## Stage run-of-show

1. Presenter signs in with an admin email, opens `/host`, saves themselves
   as demo host, connects Google on `/settings`.
2. Projector stays on `/host`. Raise board rules to **6 / 3** for the talk
   (defaults are 1 / 1 for rehearsal).
3. Audience scans the QR → Auth0 login → `/join`.
4. **Pick board.** Seated phones show "you're on the board."
5. Second window: `/file-claim`, Hulk-smashed Honda Pilot, confirm.
   `/host` auto-starts CIBA.
6. Board members Accept in email. Threshold yeses → approved, confetti,
   calendar event.

**Start over** (admin only) on `/file-claim` or `/host` wipes the projector
claim and the seated board. Joiners, board rules, demo host, and Google
stay.

---

## Layout

```
app/            pages + route handlers
components/     client components (chat, join, host, board) + shadcn/ui
lib/agent/      Vercel AI SDK tool loop (gateway + Anthropic default)
lib/ciba.ts     /bc-authorize + CIBA token poll (not @auth0/ai)
lib/board.ts    joiners + pick
lib/board-config.ts  board rules + demo host identity
lib/host.ts     admin email gate
lib/claims.ts   claim SQL
lib/auth0.ts    Auth0 client, Token Vault connect-account
db/schema.sql   claims / messages / joiners / board / ciba / demo_settings
proxy.ts        Auth0 route mounting + page protection
```
