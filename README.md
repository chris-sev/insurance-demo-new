# Hero Shield Insurance

A conference-demo app: superhero car insurance. File a claim by **talking to
an AI agent**, a **logged-in CIBA board** approves it over email, and the
presenter's **Google Calendar** gets the event via Auth0 Token Vault.

Built on Next.js 16 + Auth0 + Neon Postgres + the Vercel AI SDK (AI Gateway,
Anthropic default). It is a port of an earlier AWS/Vite version of the same
demo — same Marvel script on stage, a different grant.

**Setup lives in [SETUP.md](SETUP.md).** Human + agent onboarding
(Neon, Auth0, Vercel AI SDK, CIBA dashboard, MCPs):
**[CONTRIBUTING.md](CONTRIBUTING.md)**.

![Hero Shield landing page](docs/images/landing.jpg)

---

## Auth0 features in this demo

This is an Auth0 product demo. The app uses these Auth0 capabilities
on purpose — they are the point of the talk:

| Feature | Where it shows up |
| ------- | ----------------- |
| **Universal Login** | Every login (`/auth/login`) — audience QR, admin console, filer chat |
| **Regular Web Application** + server session cookie | `@auth0/nextjs-auth0` v4 in [proxy.ts](proxy.ts) / [lib/auth0.ts](lib/auth0.ts). Not a SPA. Needs a client secret. |
| **Email verification** | Unverified joiners watch `/join`; they cannot sit on the CIBA board |
| **Custom ID token claims** | Optional post-login Action sets `https://claims.interview-demo.com/policyId` |
| **CIBA (Client-Initiated Backchannel Authentication)** | Seated board approves the claim from email. `requested_expiry=600` selects the **email** channel, not Guardian. Requires **Essentials (or Professional) + Auth0 for AI Agents add-on**. |
| **CIBA email / Asynchronous Approval template** | Branding → Email Templates → Asynchronous Approval. `login_hint` is `iss_sub`. |
| **Token Vault** | Host-only Google Calendar connect on `/settings` (`/auth/connect`). Audience never sees Google consent. |
| **First-party confidential client** | Required for the CIBA grant (`oidc_conformant`, not `token_endpoint_auth_method: none`) |

![Auth0 Universal Login for Insurance Demo Oktane](docs/images/auth0-login.jpg)

CIBA setup, plan requirements, and Token Vault steps:
[CONTRIBUTING.md](CONTRIBUTING.md#auth0-ciba-dashboard).

---

## What the demo does

1. **The room scans one QR.** `/join` sends everyone through Auth0 Universal
   Login, then asks one thing: an amount and a short reason for the claim
   ("Hulk threw my car."). Submitting flips the phone to "You're in" and
   echoes the room's live totals. Unverified emails can submit a request;
   only the human approver seat needs a verified email.
2. **The operator picks the showcase request.** An admin login (`@okta.com`,
   `admin@focusotter.com`, or an email listed in `DEMO_ADMIN_EMAILS`) opens
   `/host` and taps **Pick showcase request**. The pick is deterministic:
   the room's largest requested amount, tie broken by earliest submission,
   or a specific request via its row's "Pick this" button.
3. **The Claims Supervisor runs five specialist stages.**
   [lib/agent/supervisor.ts](lib/agent/supervisor.ts) is **one** Vercel AI
   SDK `generateText` loop, not a multi-agent runtime. It calls five tools
   in a fixed order (Policy, Coverage, Risk, Repair, and Customer Update
   Specialist), and each call appends one stage row the `/host` projector
   polls live. A 45s timeout with templated fallbacks means the stage never
   stalls in front of a room.
4. **Policy code decides, never the model.** Requests at or below
   **$100,000** auto-approve. Above that, the claim becomes an exception
   and crosses the human authority boundary.
5. **CIBA sends one email.** For an exception claim, the open `/host`
   console starts CIBA automatically: one asynchronous approval email to
   the seated human approver (board size **1** by default). The room's
   other requests stay visible as a queue so participation still pays off.
   If the host has not connected Google Calendar, CIBA is withheld, since a
   yes would have nowhere to write the calendar event.
6. **Approval schedules a Token Vault event.** Once a showcase claim is
   approved, whether by the human approver or automatically under the
   threshold, the Repair Specialist's calendar event lands on the host's
   Google Calendar: `Repair inspection — claim HS-XXXX`.
7. **The show closes on one line:** "Every agent has a principal. Every
   delegation is scoped. Real authority crosses a human boundary."
8. **The chat path is still there.** `/file-claim` is the original claims
   agent chat flow (white 2006 Honda Pilot, Hulk-smashed car); it shows on
   `/host` whenever no showcase claim exists.

![Audience join: submit an amount and reason, then "You're in"](docs/images/join.jpg)

The interesting part is that **every one of those steps is a row in Postgres**.
Refresh mid-claim and you resume exactly where you were; the room, the
stages, and the CIBA polls are all durable.

---

## How it works

```
browser ──▶ proxy.ts ──────────────▶ Route Handler ──▶ lib/agent/run.ts ──▶ Vercel AI Gateway
            (Auth0 session gate)      auth0.getSession()      │  tool loop          (Anthropic default)
                                                              ▼
                                                        lib/claims.ts ──▶ Neon Postgres
                                                              │
submit ──▶ lib/ciba.ts /bc-authorize (× seated) ──▶ poll /oauth/token
                                                              │
threshold yeses ──▶ Token Vault Google token ──▶ Calendar event (host only)
```

**Auth.** [proxy.ts](proxy.ts) — Next.js 16 renamed Middleware to Proxy — mounts
the Auth0 v4 routes (`/auth/login`, `/auth/callback`, `/auth/connect`) and
gates the protected pages. API routes check the session themselves so a
`fetch()` gets `401` JSON instead of an HTML login page.

**CIBA.** [lib/ciba.ts](lib/ciba.ts) copies the working loop from
[mtliendo/ciba-email](https://github.com/mtliendo/ciba-email). This app does
**not** use `@auth0/ai`. `requested_expiry=600` selects the email channel.

**Token Vault.** [lib/auth0.ts](lib/auth0.ts) sets
`enableConnectAccountEndpoint: true`. Audience login is `openid profile email`
only — no calendar scope, no `offline_access`. Only an admin hits
`/settings` → `/auth/connect` for Google Calendar.

**The agent.** [lib/agent/](lib/agent/) is a Vercel AI SDK `generateText`
loop. Same conversation, same three tools. Calls go through the AI Gateway
(`anthropic/claude-opus-5` by default). `publish_claim_submission` flips
the claim to `awaiting_approval` and calls `startCibaForSubmittedClaim`
(admin session only). A non-admin filer gets `not_host`; `GET /api/board`
on the open `/host` console starts the same grant.

**The Claims Supervisor.** [lib/agent/supervisor.ts](lib/agent/supervisor.ts)
is a second, separate `generateText` loop for the showcase path: one
supervisor call that makes five tool calls, one per named specialist stage,
in a fixed order. `POST /api/showcase` runs it inline and returns once all
five stages, or their deterministic templated fallbacks after a 45s
timeout, have landed. Policy code, never the model, decides auto-approval
vs. exception against the $100,000 threshold.

**State and realtime.** There is no websocket. `/file-claim` and `/host`
refresh UI every 2s. Auth0 `/oauth/token` is only hit when a pending
`auth_req_id` is due.

### Routes

| Route | Auth | Purpose |
| ----- | ---- | ------- |
| `/` | public | Marketing landing page, with the room's field-evidence carousel |
| `/join` | login | QR landing: submit an amount + reason, watch the room, see approver seat |
| `/host` | admin (`@okta.com`, `admin@focusotter.com`, or `DEMO_ADMIN_EMAILS`) | QR, demo host, approver seat, pick showcase request, live stage |
| `/settings` | admin | Connect Google Calendar (Token Vault) |
| `/file-claim` | protected | Chat with the claims agent; live board sidebar |
| `/profile` | protected | Auth0 profile and the `policyId` custom claim |
| `POST /api/claims` | protected | Starts or resumes the caller's claim |
| `POST /api/claims/reset` | admin | Wipe projector claim + chat / CIBA + seated board + showcase claim |
| `GET /api/claims/[id]` | protected | Claim snapshot; admin ticks due CIBA ids |
| `POST /api/claims/[id]/chat` | protected | One agent turn (AI Gateway) |
| `GET \| POST /api/join` | login | Upsert joiner; `POST` body `{ amount, reason }` saves a showcase request |
| `POST /api/join/clear` | admin | Null out every audience request (joiners stay in the room) |
| `GET /api/board` | admin | Joiners + room stats + live board + claim/CIBA snapshot; auto-starts CIBA |
| `POST /api/board/pick` | admin | Randomly seat the saved board size (pins first) |
| `POST /api/board/settings` | admin | Save board size and CIBA yes threshold |
| `POST /api/board/host` | admin | Save demo host email + Auth0 sub |
| `POST /api/showcase` | admin | Pick the room's largest request (or a given `sub`), create the claim, run the Claims Supervisor inline |
| `GET \| POST /api/ciba` | admin | Board status; fallback start if auto-start failed |
| `POST /api/ciba/poll` | admin | Tick due `/oauth/token` per `auth_req_id` |
| `GET /api/connection-status` | admin | Token Vault Google connected? |

---

## Running it

The app will not start a useful claims chat without these in `.env.local`:

| Key | Why |
| --- | --- |
| Auth0 (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`) | Universal Login + session cookie |
| `DATABASE_URL` | Neon |
| **`AI_GATEWAY_API_KEY`** | Vercel AI Gateway. Required for `/file-claim`. There is no Anthropic key — do not set `ANTHROPIC_API_KEY`. |

Optional: `DEMO_ADMIN_EMAILS` (comma-separated) adds extra operator logins
for `/host` and `/settings` beyond `@okta.com` and `admin@focusotter.com`.

Mint the gateway key at
[Vercel AI Gateway API keys](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai-gateway%2Fapi-keys).
On a linked Vercel project you can use `vercel env pull` (`VERCEL_OIDC_TOKEN`)
instead. Restart `pnpm dev` after editing `.env.local`.

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # typecheck + production build
pnpm lint
```

Full environment and database setup: **[SETUP.md](SETUP.md)**.
CIBA plan + dashboard: **[CONTRIBUTING.md](CONTRIBUTING.md#auth0-ciba-dashboard)**.

## Rehearsal defaults (1 / 1)

Code, seed, and UI default to **pick 1 / 1 yes**. The presenter sets the
live values on **`/host` → Board rules** (board size and CIBA yes
threshold). Those persist in Neon `demo_settings`. Raise to **6 / 3** on
`/host` for the real talk.

## Running the demo on stage

1. Presenter signs in with an admin email, opens `/host`, expands
   **Pre-show settings**, saves **Demo host** (their email + `sub`), seats
   the human approver, and connects Google Calendar from `/settings`.
2. Projector stays on `/host` (intake stage: QR + room counters). Audience
   scans the QR → Auth0 login → `/join` → submits an amount and a reason →
   "You're in."
3. Operator taps **Pick showcase request**. `/host` picks the room's
   largest amount (or a specific row's "Pick this") and creates the
   showcase claim.
4. The Claims Supervisor runs its five stages live on the projector.
5. At or below $100,000 the claim auto-approves. Above it, `/host` shows
   the exception panel and auto-starts CIBA: one approval email to the
   seated human approver.
6. Approval (the human's tap, or the automatic threshold decision) shows
   the outcome panel and schedules `Repair inspection — claim HS-XXXX` on
   the host's Google Calendar via Token Vault.

Between runs: **Clear room requests** (pre-show settings) resets the
queue; **Start over** wipes the showcase claim and seated approver.
