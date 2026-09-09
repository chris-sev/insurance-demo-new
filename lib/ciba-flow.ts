import { getCurrentBoard, withoutHost } from '@/lib/board'
import { bindingMessageForClaim } from '@/lib/binding-message'
import { pollCiba, startCiba } from '@/lib/ciba'
import { CIBA_INTERVAL_FLOOR, floorInterval, nextPollInterval } from '@/lib/ciba-interval'
import {
  claimCibaPollSlot,
  countCibaApproved,
  duePendingCiba,
  hasCibaStarted,
  hasLiveCiba,
  insertCibaAuthorization,
  listCibaForClaim,
  updateCibaStatus,
} from '@/lib/ciba-store'
import {
  approveClaim,
  attachCalendarEvent,
  getClaim,
  setCibaBlockReason,
} from '@/lib/claims'
import { createEvent } from '@/lib/google-calendar'
import { getGoogleAccessToken, isGoogleConnected } from '@/lib/google'
import { auth0 } from '@/lib/auth0'
import {
  freezeCibaBoardRules,
  frozenBoardRules,
  getBoardSettings,
  getDemoHost,
  isFullBoard,
} from '@/lib/board-config'
import { canWriteHostCalendar, isAdmin, matchesDemoHost } from '@/lib/host'
import type { CibaAutoStart, Claim } from '@/lib/types'

export type { CibaAutoStart, CibaStartFailReason } from '@/lib/types'
export type CibaStartResult = CibaAutoStart

type SessionUser = { sub?: string; email?: string | null }

function boardSizeFail(
  seated: number,
  required: number,
): Extract<CibaStartResult, { ok: false }> {
  if (seated === 0) {
    return { ok: false, reason: 'no_board', seated, required }
  }
  return { ok: false, reason: 'short_board', seated, required }
}

/**
 * Tool-result copy for the claims agent. The model must tell the filer
 * this — publish_claim_submission used to discard the start result, so
 * a blocked grant looked like a successful send.
 */
export function cibaStartAgentMessage(result: CibaStartResult): string {
  if (result.ok) {
    if (result.started === 0) {
      return [
        'Claim is submitted (status awaiting_approval), but CIBA emails were NOT sent.',
        `Auth0 accepted none of the ${result.seated} seated board member(s).`,
        'Tell the filer that in chat. Do not say the board was emailed.',
        'Do not say the demo is broken. Do not say the operator was emailed.',
        'Do not tell the filer to click Send CIBA.',
      ].join(' ')
    }
    const all = result.started === result.seated
    return [
      `Claim submitted. CIBA email grant started for ${result.started} of ${result.seated} seated board member(s)`,
      '(same grant as POST /api/ciba, requested_expiry=600).',
      all
        ? 'Thank the user and tell them the seated board was just emailed to review the claim.'
        : 'Tell the filer some seats were emailed and the projector will show any Auth0 errors.',
      'Do not say the operator was emailed. Do not tell them to click Send CIBA.',
    ].join(' ')
  }

  const prefix =
    'Claim is submitted (status awaiting_approval), but CIBA emails were NOT sent.'

  switch (result.reason) {
    case 'no_google':
      return [
        prefix,
        'Reason: host Google Calendar is not connected (Token Vault is host-only; audience never connects Google).',
        'Tell the filer that in chat. A board yes is hollow without a host calendar.',
        'The operator console will start CIBA automatically once Google is connected.',
        'Do not tell them to go click Send CIBA.',
      ].join(' ')
    case 'no_board':
      return [
        prefix,
        `Reason: no eligible board is seated (need exactly ${result.required ?? 'the saved size'}).`,
        'The operator cannot sit — leftover host-only seats do not count.',
        'Tell the filer nobody was emailed yet and the operator still needs to pick someone from the room.',
        'The operator console will start CIBA automatically once a full non-host board is seated.',
        'Do not say the demo is broken. Do not say the operator was emailed.',
        'Do not tell them to go click Send CIBA.',
      ].join(' ')
    case 'short_board':
      return [
        prefix,
        `Reason: seated board is ${result.seated ?? 0}, required exact size is ${result.required ?? 'unknown'}.`,
        'The operator cannot sit and is never emailed.',
        'Tell the filer the board is short and emails were not sent.',
        'The operator console will start CIBA automatically once a full board is picked.',
        'Do not say the demo is broken.',
        'Do not tell them to go click Send CIBA.',
      ].join(' ')
    case 'already_started':
      return [
        'CIBA is already live for this claim.',
        'Tell the filer the board emails are already out. Do not imply they need to resend.',
      ].join(' ')
    case 'not_host':
      return [
        'Claim is submitted (status awaiting_approval).',
        'This session is not the demo host, so CIBA was not started here (host-only Token Vault).',
        'The operator console on /host starts CIBA automatically on its next poll — same grant as Send CIBA.',
        'Tell the filer the seated board is being emailed / it is starting.',
        'Do not tell them to go click Send CIBA. Do not send them to /host to send mail.',
        'Do not say the operator was emailed. Do not say the demo is broken.',
      ].join(' ')
  }
}

/**
 * Host console poll (`GET /api/board`): start CIBA for an
 * `awaiting_approval` claim. Same grant as `POST /api/ciba` and the
 * claims agent. `already_started` / `hasLiveCiba` is a no-op.
 */
export async function autoStartCibaFromHostPoll(
  claim: Claim | null,
): Promise<CibaStartResult | null> {
  if (!claim || claim.status !== 'awaiting_approval') return null
  return startCibaForSubmittedClaim(claim.id)
}

/**
 * When a claim flips to awaiting_approval, email the seated board — not
 * the whole room, and never the demo host. Host session only. Refuses
 * to send if the host has not connected Google (hollow approval
 * otherwise) or if the seated board is empty, host-only, or not
 * exactly the saved size.
 */
export async function startCibaForSubmittedClaim(claimId: string): Promise<CibaStartResult> {
  if (await hasCibaStarted(claimId)) {
    return { ok: false, reason: 'already_started' }
  }
  if (await hasLiveCiba()) {
    return { ok: false, reason: 'already_started' }
  }

  const session = await auth0.getSession()
  if (!session || !isAdmin(session.user)) {
    return { ok: false, reason: 'not_host' }
  }

  if (!(await isGoogleConnected())) {
    await setCibaBlockReason(claimId, 'no_google')
    return { ok: false, reason: 'no_google' }
  }

  const claim = await getClaim(claimId)
  if (!claim) return { ok: false, reason: 'no_board', seated: 0 }

  const [live, host] = await Promise.all([getBoardSettings(), getDemoHost()])
  const intended = frozenBoardRules(claim) ?? live
  const board = withoutHost(await getCurrentBoard(), host)
  if (!isFullBoard(board.length, intended.boardSize)) {
    await setCibaBlockReason(claimId, 'no_board')
    return boardSizeFail(board.length, intended.boardSize)
  }

  const frozen = await freezeCibaBoardRules(claimId, intended)
  if (!isFullBoard(board.length, frozen.boardSize)) {
    await setCibaBlockReason(claimId, 'no_board')
    return boardSizeFail(board.length, frozen.boardSize)
  }

  await setCibaBlockReason(claimId, null)
  const bindingMessage = bindingMessageForClaim(claimId)
  let started = 0

  for (const member of board) {
    if (matchesDemoHost(host, member.sub, member.email)) continue
    try {
      const result = await startCiba(member.sub, bindingMessage)
      const expiresAt = new Date(Date.now() + result.expiresIn * 1000)
      await insertCibaAuthorization({
        claimId,
        authReqId: result.authReqId,
        sub: member.sub,
        email: member.email,
        name: member.name,
        status: 'pending',
        bindingMessage: result.bindingMessage,
        intervalSec: floorInterval(result.interval),
        expiresAt,
      })
      started += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : 'bc-authorize failed'
      await insertCibaAuthorization({
        claimId,
        authReqId: `error-${claimId}-${member.sub}`,
        sub: member.sub,
        email: member.email,
        name: member.name,
        status: 'error',
        bindingMessage,
        intervalSec: CIBA_INTERVAL_FLOOR,
        expiresAt: null,
        error: message,
      })
    }
  }

  return { ok: true, started, seated: board.length }
}

/**
 * Poll due pending auth_req_ids only. The yes threshold frozen on the
 * claim at CIBA start releases it, then write one event on the host's
 * Google Calendar via Token Vault — and only if this session is the
 * configured host. Live demo_settings must not change that pair.
 */
export async function pollCibaForClaim(
  claimId: string,
  actor: SessionUser,
): Promise<Claim | null> {
  const pending = duePendingCiba(await listCibaForClaim(claimId))

  for (const row of pending) {
    const slot = await claimCibaPollSlot(row.auth_req_id)
    if (!slot) continue

    const result = await pollCiba(row.auth_req_id)
    if (result.status === 'pending') {
      const intervalSec = nextPollInterval(
        slot.interval_sec,
        result.interval,
        result.slowDown,
      )
      await updateCibaStatus(row.auth_req_id, 'pending', { intervalSec })
      continue
    }
    await updateCibaStatus(row.auth_req_id, result.status, {
      error: 'error' in result ? result.error : null,
    })
  }

  const claim = await getClaim(claimId)
  if (!claim) return null

  let rules = frozenBoardRules(claim)
  if (!rules && (await hasCibaStarted(claimId))) {
    rules = await freezeCibaBoardRules(claimId, await getBoardSettings())
  }
  if (!rules) {
    return getClaim(claimId)
  }

  const approved = await countCibaApproved(claimId)
  if (approved >= rules.yesThreshold) {
    await approveClaim(claimId)
    if (canWriteHostCalendar(actor, await getDemoHost())) {
      await writeHostCalendarEvent(claimId)
    }
  }

  return getClaim(claimId)
}

async function writeHostCalendarEvent(claimId: string): Promise<void> {
  const claim = await getClaim(claimId)
  if (!claim || claim.calendarEventId) return

  const token = await getGoogleAccessToken()
  if (!token) return

  const yeses = (await listCibaForClaim(claimId))
    .filter((row) => row.status === 'approved')
    .map((row) => row.name)
    .join(', ')

  const start = new Date()
  const end = new Date(start.getTime() + 30 * 60 * 1000)

  try {
    const event = await createEvent(token, {
      summary: `Hero Shield claim approved · ${claim.policyId}`,
      description: [
        claim.incidentDescription ?? 'Superhero incident',
        claim.incidentLocation ? `Location: ${claim.incidentLocation}` : null,
        claim.damageExtent ? `Damage: ${claim.damageExtent}` : null,
        `Released by CIBA board: ${yeses}`,
        `Claim ${claim.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
      location: claim.incidentLocation ?? undefined,
      startDateTime: start.toISOString(),
      endDateTime: end.toISOString(),
      timeZone: 'America/Los_Angeles',
    })
    await attachCalendarEvent(claimId, event.id)
  } catch (error) {
    console.error('Failed to write host calendar event:', error)
  }
}
