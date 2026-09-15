# Hero Shield: Claims Control Room stage flow

## The one sentence

**One audience request becomes a governed chain of work: a Claims Supervisor coordinates specialists, each action has an identity, and only exceptional spend asks a human to approve.**

## Stage flow (8 minutes)

### 1. Join the room (0:00-1:00)

- Projector (`/host`, intake stage) shows the QR code, the caption `Scan to file your claim`, and the join URL in small mono type.
- Audience scans, completes Auth0 Universal Login, and lands on `/join`.
- Logged in with no request yet: a mobile form, kicker "Your claim", h1 `How much should Hero Shield reimburse you?`, a huge `$`-prefixed amount input, and a "What happened?" textarea (placeholder `Hulk threw my car.`). One button: `Submit my claim`.
- Submitting flips the phone to `You're in.` / `Watch the room.`, echoing their own request and a live line: `N people in the room · N requests · $X.XM requested`.
- The projector's three counters, **In the room**, **Requests**, **Requested**, and an up-to-8-row **Queue** (largest amount first, "Next up" badge on the top row) update on the same 2s poll.
- Unverified emails can still submit a request; they only can't sit in the human approver seat. Never call audience members or the operator agents.

### 2. Pick the showcase request (1:00-1:30)

- The operator (admin login) taps **Pick showcase request** in the operator bar. Enabled once the room has at least one request and no showcase claim is already on stage.
- The pick is deterministic: the largest requested amount, tie broken by earliest submission, or the operator taps a specific row's **Pick this** button instead.
- This creates the claim and the Claims Supervisor starts running before the response even comes back; the poll paints whatever stages have landed.
- Smaller requests stay visible as a compact queue strip during processing, so participation still has a payoff ("N other requests in the queue").

### 3. Show governed work (1:30-3:30)

The runtime is honestly **one** Vercel AI SDK `generateText` loop
([lib/agent/supervisor.ts](../lib/agent/supervisor.ts)), never five
independent model processes. The UI presents its five tool calls as five
named specialist stages, each with a status the projector shows live
(waiting, then running, then done or flagged):

1. **Policy Specialist**: Policy records.
2. **Coverage Specialist**: Coverage rules.
3. **Risk Specialist**: Fraud & anomaly checks.
4. **Repair Specialist**: Company calendar · Token Vault.
5. **Customer Update Specialist**: Customer message.

Above the stage list, the header shows the claim code, the amount huge in
gold, the reason verbatim in quotes, and `Requested by <first name> ·
customer`, followed by the delegation line:

`Claims Supervisor · acting for <customer> · Hero Shield authority`

This is a truthful stage metaphor for today's single supervisor loop. It
does not claim five independent model processes are running.

### 4. Make authority visible (3:30-4:30)

Below the stage list, a compact identity-chain strip reads:

`Customer request → Claims Supervisor → <current specialist> → Company tool`

The identity story:

- **Agent as principal:** the Claims Supervisor is the caller responsible
  for every tool call.
- **On behalf of:** the stage record names the customer and Hero Shield
  company authority ("acting for `<customer>` · Hero Shield authority").
  This is UI wording, not an enforced OBO / agent-principal token
  exchange.
- **Token Vault:** after approval, the Repair Specialist's summary
  schedules a repair inspection on the company's connected Google
  Calendar. It is the only Token Vault action in the demo.

### 5. Use CIBA only at the authority boundary (4:30-6:30)

- Policy code, never the model, compares the amount to
  `HUMAN_AUTHORITY_THRESHOLD` ($100,000). At or below, the claim
  auto-approves the moment the five stages land.
- Above it, the projector shows a red-bordered panel: `Exception: human
  authorization required`, with `$1,000,000 is above the $100,000
  authority limit. Auth0 sent an approval email to <approver name>.`
- The next `/host` poll auto-starts CIBA: **one** asynchronous approval
  email to the seated human approver (board size **1** by default; this
  is the existing CIBA "board," resized down to a single seat for this
  flow, not a room vote). `login_hint` is `iss_sub`; `binding_message`
  carries the amount and claim code.
- The approver's own `/join` phone shows "You're the human approver" and
  the CIBA status (pending / approved / denied / error). Never call this
  person an agent.
- One approval changes the projector on its next poll. **Send CIBA
  emails** in the exception panel is only a fallback when auto-start was
  blocked (no Google connection, no approver seated, or an Auth0 error).

### 6. Payoff (6:30-8:00)

- The projector resolves to a green **Approved · $1,000,000** panel
  (`Authorized by <approver>` or `Auto-approved under the $100,000 policy
  threshold`) or a red **Declined · $1,000,000** panel.
- The Repair Specialist row highlights `Repair inspection — claim
  HS-XXXX`, then either `Scheduled on the company calendar via Auth0
  Token Vault` (once `calendarEventId` lands) or a cyan `Scheduling on the
  company calendar…` pulse while it's in flight.
- The queue stays visible in small type at the bottom so the room's other
  requests still show as participation.
- End on the closing line, shown on the projector itself: **"Every agent
  has a principal. Every delegation is scoped. Real authority crosses a
  human boundary."**

## UI rules for the refresh

- One action per screen; hide host configuration behind a **Pre-show
  settings** `<details>` drawer (Google Calendar / Token Vault status,
  demo host, human approver seat, board rules, clear room requests).
- Stage typography: 56-96px headlines, 24-32px status text, 18px minimum
  body text, huge counters.
- Color roles: gold = money/approval, red (`primary`) = exception / human
  boundary, cyan (`hud`) = machine activity ("Running…"), stone-time green
  = done/approved.
- Keep the existing HUD palette and components (`.hud-panel`,
  `.hud-brackets`, `.hud-label`, Button/Badge variants); no new global CSS
  system.

## Deterministic fallbacks (shipped)

The showcase stage can never stall in front of a room:

- The supervisor call is wrapped in a 45-second `AbortSignal.timeout`.
- On any error, timeout, or a stage the model skipped, `fillMissingStages`
  fills the gap with a plain templated summary built from the actual
  amount, reason, and customer name, never generic boilerplate, and the
  stage list still shows every row as done.
- The approve/exception decision is always policy code comparing the
  amount to the $100,000 threshold. The model is explicitly instructed
  never to decide or mention approval/denial itself.

## Implementation boundary

**Done, first pass:** the amount + reason join flow, the deterministic
showcase pick, the five specialist stages derived from
`lib/agent/supervisor.ts`'s tool calls, the $100,000 policy-code decision,
CIBA narrowed to a single asynchronous approval email at the authority
boundary, and the Token Vault repair-inspection calendar event. All of
the above is shipped and live on `/host` and `/join`.

**Not built, and out of scope for this pass:** a true fleet of
independently running agents, or per-participant concurrent claims
processed in parallel. The Claims Supervisor remains one sequential loop
per showcase claim; that is a later architecture step, not this one.
