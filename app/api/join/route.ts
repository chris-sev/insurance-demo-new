import { NextResponse } from 'next/server'
import { emailVerifiedFromUser } from '@/lib/auth0'
import { requireSession } from '@/lib/api-auth'
import {
  getJoiner,
  isOnCurrentBoard,
  listJoiners,
  roomStats,
  saveJoinerRequest,
  upsertJoiner,
  type Joiner,
} from '@/lib/board'
import { getBoardSettings, getDemoHost } from '@/lib/board-config'
import { getCibaForSub } from '@/lib/ciba-store'
import { getLatestSubmittedClaim, getShowcaseClaim } from '@/lib/claims'
import { matchesDemoHost } from '@/lib/host'
import { claimCode } from '@/lib/types'

export const dynamic = 'force-dynamic'

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

const MIN_AMOUNT = 1
const MAX_AMOUNT = 1_000_000_000
const MIN_REASON = 3
const MAX_REASON = 200

type SessionUser = {
  sub: string
  email?: string | null
  name?: string | null
}

async function joinPayload(
  user: SessionUser,
  extra?: { joiner?: Joiner | null; skipped?: string },
) {
  const email = typeof user.email === 'string' ? user.email : ''
  const joiner = extra && 'joiner' in extra ? (extra.joiner ?? null) : await getJoiner(user.sub)
  const onBoard = extra?.skipped === 'host' ? false : await isOnCurrentBoard(user.sub, email)
  const claim = await getLatestSubmittedClaim()
  const [ciba, settings, host, joiners, showcase] = await Promise.all([
    claim && extra?.skipped !== 'host'
      ? getCibaForSub(claim.id, user.sub)
      : Promise.resolve(null),
    getBoardSettings(),
    getDemoHost(),
    listJoiners(),
    getShowcaseClaim(),
  ])
  const room = await roomStats(joiners, null)

  return {
    host: matchesDemoHost(host, user.sub, email),
    joiner,
    onBoard,
    emailVerified: emailVerifiedFromUser(user as Record<string, unknown>),
    boardSize: settings.boardSize,
    claimStatus: claim?.status ?? null,
    ciba: ciba
      ? { status: ciba.status, bindingMessage: ciba.binding_message, error: ciba.error }
      : null,
    request:
      joiner && joiner.requestedAmount != null
        ? { amount: joiner.requestedAmount, reason: joiner.incidentReason ?? '' }
        : null,
    room: { joined: room.joined, requests: room.requests, totalRequested: room.totalRequested },
    showcase: showcase
      ? {
          mine: showcase.userId === user.sub,
          code: claimCode(showcase.id),
          amount: showcase.requestedAmount ?? 0,
          status: showcase.status,
          decision: showcase.decision,
          customerName: showcase.customerName ?? '',
        }
      : null,
    ...(extra?.skipped ? { skipped: extra.skipped } : {}),
  }
}

export async function GET() {
  const auth = await requireSession()
  if ('error' in auth) return auth.error

  return NextResponse.json(await joinPayload(auth.session.user), { headers: NO_STORE })
}

/**
 * Presence upsert as before. With a JSON body ({ amount, reason }) also
 * saves the audience's showcase request — unverified emails can submit;
 * only the human approver seat needs a verified email.
 */
export async function POST(request: Request) {
  const auth = await requireSession()
  if ('error' in auth) return auth.error

  const { user } = auth.session
  const email = typeof user.email === 'string' ? user.email : ''
  const name = typeof user.name === 'string' && user.name ? user.name : email || 'Joiner'
  const emailVerified = emailVerifiedFromUser(user)

  const host = await getDemoHost()
  if (matchesDemoHost(host, user.sub, email)) {
    return NextResponse.json(await joinPayload(user, { joiner: null, skipped: 'host' }), {
      headers: NO_STORE,
    })
  }

  if (!email) {
    return NextResponse.json({ error: 'Auth0 profile is missing an email.' }, { status: 400 })
  }

  const body = (await request.json().catch(() => null)) as
    | { amount?: unknown; reason?: unknown }
    | null

  let joiner = await upsertJoiner({ sub: user.sub, email, name, emailVerified })

  if (body && (body.amount !== undefined || body.reason !== undefined)) {
    const amount = Math.trunc(Number(body.amount))
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) {
      return NextResponse.json(
        { error: `Amount must be a whole number from ${MIN_AMOUNT} to ${MAX_AMOUNT}.` },
        { status: 400 },
      )
    }
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
      return NextResponse.json(
        { error: `Tell us what happened in ${MIN_REASON} to ${MAX_REASON} characters.` },
        { status: 400 },
      )
    }
    joiner = (await saveJoinerRequest(user.sub, amount, reason)) ?? joiner
  }

  return NextResponse.json(await joinPayload(user, { joiner }), { headers: NO_STORE })
}
