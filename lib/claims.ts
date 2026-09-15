import { clearSeatedBoard } from '@/lib/board'
import { ensureBoardRulesSchema } from '@/lib/board-config'
import { sql } from '@/lib/db'
import type {
  ChatMessage,
  CibaBlockReason,
  Claim,
  ClaimDecision,
  ClaimStage,
  ClaimStatus,
} from '@/lib/types'

type ClaimRow = {
  id: string
  user_id: string
  policy_id: string
  incident_description: string | null
  incident_location: string | null
  damage_extent: string | null
  status: ClaimStatus
  fraud_flagged: boolean
  created_at: Date | string
  calendar_event_id: string | null
  ciba_block_reason: string | null
  ciba_board_size: number | null
  ciba_yes_threshold: number | null
  requested_amount: string | number | null
  customer_name: string | null
  stages: unknown
  decision: string | null
}

// ponytail: jsonb comes back parsed from the HTTP driver in practice, but the
// contract doesn't guarantee it — handle the string form too rather than crash.
function parseStages(value: unknown): ClaimStage[] {
  if (Array.isArray(value)) return value as ClaimStage[]
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function toDecision(value: string | null): ClaimDecision {
  return value === 'auto_approved' || value === 'exception' ? value : null
}

function toClaim(row: ClaimRow): Claim {
  return {
    id: row.id,
    userId: row.user_id,
    policyId: row.policy_id,
    incidentDescription: row.incident_description,
    incidentLocation: row.incident_location,
    damageExtent: row.damage_extent,
    status: row.status,
    fraudFlagged: row.fraud_flagged,
    createdAt: new Date(row.created_at).toISOString(),
    calendarEventId: row.calendar_event_id,
    cibaBlockReason:
      row.ciba_block_reason === 'no_google' || row.ciba_block_reason === 'no_board'
        ? row.ciba_block_reason
        : null,
    cibaBoardSize:
      row.ciba_board_size == null ? null : Number(row.ciba_board_size),
    cibaYesThreshold:
      row.ciba_yes_threshold == null ? null : Number(row.ciba_yes_threshold),
    requestedAmount: row.requested_amount == null ? null : Number(row.requested_amount),
    customerName: row.customer_name,
    stages: parseStages(row.stages),
    decision: toDecision(row.decision),
  }
}

export async function createClaim(userId: string, policyId: string): Promise<Claim> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    insert into claims (user_id, policy_id)
    values (${userId}, ${policyId})
    returning *
  `) as ClaimRow[]
  return toClaim(rows[0])
}

export async function getClaim(id: string): Promise<Claim | null> {
  await ensureBoardRulesSchema()
  const rows = (await sql`select * from claims where id = ${id}`) as ClaimRow[]
  return rows[0] ? toClaim(rows[0]) : null
}

/** Most recent claim for a user — lets the file-claim page resume instead of restarting. */
export async function getLatestClaimForUser(userId: string): Promise<Claim | null> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    select * from claims
    where user_id = ${userId} and status <> 'approved'
    order by created_at desc
    limit 1
  `) as ClaimRow[]
  return rows[0] ? toClaim(rows[0]) : null
}

export async function listMessages(claimId: string): Promise<ChatMessage[]> {
  const rows = (await sql`
    select role, content from messages
    where claim_id = ${claimId}
    order by created_at, id
  `) as { role: 'user' | 'assistant'; content: string }[]
  return rows.map((r) => ({ role: r.role, content: r.content }))
}

export async function addMessage(
  claimId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<void> {
  await sql`
    insert into messages (claim_id, role, content)
    values (${claimId}, ${role}, ${content})
  `
}

/** Backs the save_claim_details tool. */
export async function saveClaimDetails(
  claimId: string,
  details: {
    incidentDescription: string
    incidentLocation: string
    damageExtent: string
  },
): Promise<void> {
  await sql`
    update claims set
      incident_description = ${details.incidentDescription},
      incident_location    = ${details.incidentLocation},
      damage_extent        = ${details.damageExtent},
      updated_at           = now()
    where id = ${claimId}
  `
}

/** Backs the notify_fraud tool. Silent by design — the user is never told. */
export async function flagFraud(claimId: string, reason: string): Promise<void> {
  await sql`
    update claims
    set fraud_flagged = true, fraud_reason = ${reason}, updated_at = now()
    where id = ${claimId}
  `
}

/** Backs the publish_claim_submission tool — replaces the CLAIM_SUBMITTED event. */
export async function submitClaim(claimId: string): Promise<void> {
  await sql`
    update claims
    set status = 'awaiting_approval', updated_at = now()
    where id = ${claimId} and status = 'pending'
  `
}

export async function setCibaBlockReason(
  claimId: string,
  reason: CibaBlockReason | null,
): Promise<void> {
  await sql`
    update claims
    set ciba_block_reason = ${reason}, updated_at = now()
    where id = ${claimId}
  `
}

/**
 * Release the claim. Callers must have already checked CIBA yeses
 * against the pair frozen on this row — not live demo_settings.
 */
export async function approveClaim(claimId: string): Promise<boolean> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    update claims set status = 'approved', updated_at = now()
    where id = ${claimId}
      and status = 'awaiting_approval'
      and ciba_yes_threshold is not null
    returning id
  `) as { id: string }[]
  return rows.length > 0
}

export async function attachCalendarEvent(
  claimId: string,
  eventId: string,
): Promise<boolean> {
  const rows = (await sql`
    update claims
    set calendar_event_id = ${eventId}, updated_at = now()
    where id = ${claimId} and calendar_event_id is null
    returning id
  `) as { id: string }[]
  return rows.length > 0
}

/** Operator "Pick showcase request" creates the row the Claims Supervisor processes. */
export async function createShowcaseClaim(input: {
  userId: string
  policyId: string
  customerName: string
  requestedAmount: number
  reason: string
}): Promise<Claim> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    insert into claims (
      user_id, policy_id, customer_name, requested_amount, incident_description, stages
    )
    values (
      ${input.userId}, ${input.policyId}, ${input.customerName},
      ${input.requestedAmount}, ${input.reason}, '[]'::jsonb
    )
    returning *
  `) as ClaimRow[]
  return toClaim(rows[0])
}

/** Atomic jsonb append so concurrent stage writes never clobber each other. */
export async function appendClaimStage(claimId: string, stage: ClaimStage): Promise<void> {
  await sql`
    update claims
    set stages = stages || ${JSON.stringify([stage])}::jsonb, updated_at = now()
    where id = ${claimId}
  `
}

export async function setClaimDecision(
  claimId: string,
  decision: ClaimDecision,
  status: ClaimStatus,
): Promise<Claim | null> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    update claims
    set decision = ${decision}, status = ${status}, updated_at = now()
    where id = ${claimId}
    returning *
  `) as ClaimRow[]
  return rows[0] ? toClaim(rows[0]) : null
}

/** amount <= HUMAN_AUTHORITY_THRESHOLD — policy code decides, not the model. */
export async function autoApproveClaim(claimId: string): Promise<Claim | null> {
  return setClaimDecision(claimId, 'auto_approved', 'approved')
}

/** All CIBA seats resolved with fewer yeses than the threshold and nothing pending. */
export async function denyClaim(claimId: string): Promise<Claim | null> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    update claims set status = 'denied', updated_at = now()
    where id = ${claimId} and status = 'awaiting_approval'
    returning *
  `) as ClaimRow[]
  return rows[0] ? toClaim(rows[0]) : null
}

/** Latest showcase claim, any status — powers /host and /api/join. */
export async function getShowcaseClaim(): Promise<Claim | null> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    select * from claims
    where requested_amount is not null
    order by created_at desc
    limit 1
  `) as ClaimRow[]
  return rows[0] ? toClaim(rows[0]) : null
}

export async function getLatestSubmittedClaim(): Promise<Claim | null> {
  await ensureBoardRulesSchema()
  const rows = (await sql`
    select * from claims
    where status in ('awaiting_approval', 'approved')
    order by created_at desc
    limit 1
  `) as ClaimRow[]
  return rows[0] ? toClaim(rows[0]) : null
}

export type ClearedClaim = {
  id: string
  status: ClaimStatus
}

/**
 * Host rehearsal reset. Deletes the claim the /host projector shows —
 * every `awaiting_approval` or `approved` row, including approved +
 * `calendar_event_id` — plus the host's latest unapproved chat, and
 * the seated board (`board_picks` / `board_members`). Leftover host
 * seats are why CIBA mailed the operator. `messages`,
 * `ciba_authorizations`, and leftover `claim_approvals` cascade from
 * `claims`. Does not delete the Google Calendar event.
 *
 * Also deletes every showcase claim (requested_amount is not null, any
 * status) so "Start over" clears the /host stage too. Joiner requests
 * (demo_joiners) stay — use POST /api/join/clear for those.
 *
 * Does not touch demo_joiners, demo_settings, Token Vault, or Auth0 users.
 */
export async function clearCurrentClaims(hostUserId: string): Promise<ClearedClaim[]> {
  await ensureBoardRulesSchema()

  // Projector uses getLatestSubmittedClaim (latest awaiting_approval or
  // approved). Must delete approved+calendar rows too, or /host keeps
  // CALENDAR WRITTEN / CIBA ticks after chat is cleared.
  const projectorRows = (await sql`
    select id, status from claims
    where status in ('awaiting_approval', 'approved')
  `) as { id: string; status: ClaimStatus }[]

  const openRows = (await sql`
    select id, status from claims
    where user_id = ${hostUserId} and status <> 'approved'
    order by created_at desc
    limit 1
  `) as { id: string; status: ClaimStatus }[]

  const showcaseRows = (await sql`
    select id, status from claims
    where requested_amount is not null
  `) as { id: string; status: ClaimStatus }[]

  const byId = new Map<string, ClaimStatus>()
  for (const row of [...projectorRows, ...openRows, ...showcaseRows]) {
    byId.set(row.id, row.status)
  }

  const deleted: ClearedClaim[] = []
  for (const id of byId.keys()) {
    const rows = (await sql`
      delete from claims where id = ${id} returning id, status
    `) as { id: string; status: ClaimStatus }[]
    if (rows[0]) deleted.push({ id: rows[0].id, status: rows[0].status })
  }

  await clearSeatedBoard()
  return deleted
}
