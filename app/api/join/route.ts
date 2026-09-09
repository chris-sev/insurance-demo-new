import { NextResponse } from 'next/server'
import { emailVerifiedFromUser } from '@/lib/auth0'
import { requireSession } from '@/lib/api-auth'
import { getJoiner, isOnCurrentBoard, upsertJoiner } from '@/lib/board'
import { getBoardSettings, getDemoHost } from '@/lib/board-config'
import { getCibaForSub } from '@/lib/ciba-store'
import { getLatestSubmittedClaim } from '@/lib/claims'
import { matchesDemoHost } from '@/lib/host'

export const dynamic = 'force-dynamic'

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
}

type SessionUser = {
  sub: string
  email?: string | null
  name?: string | null
}

async function joinPayload(
  user: SessionUser,
  extra?: { joiner?: unknown; skipped?: string },
) {
  const email = typeof user.email === 'string' ? user.email : ''
  const joiner = extra && 'joiner' in extra ? extra.joiner : await getJoiner(user.sub)
  const onBoard = extra?.skipped === 'host' ? false : await isOnCurrentBoard(user.sub, email)
  const claim = await getLatestSubmittedClaim()
  const [ciba, settings, host] = await Promise.all([
    claim && extra?.skipped !== 'host'
      ? getCibaForSub(claim.id, user.sub)
      : Promise.resolve(null),
    getBoardSettings(),
    getDemoHost(),
  ])

  return {
    host: matchesDemoHost(host, user.sub, email),
    joiner: joiner ?? null,
    onBoard,
    emailVerified: emailVerifiedFromUser(user as Record<string, unknown>),
    boardSize: settings.boardSize,
    claimStatus: claim?.status ?? null,
    ciba: ciba
      ? { status: ciba.status, bindingMessage: ciba.binding_message, error: ciba.error }
      : null,
    ...(extra?.skipped ? { skipped: extra.skipped } : {}),
  }
}

export async function GET() {
  const auth = await requireSession()
  if ('error' in auth) return auth.error

  return NextResponse.json(await joinPayload(auth.session.user), { headers: NO_STORE })
}

export async function POST() {
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

  const joiner = await upsertJoiner({
    sub: user.sub,
    email,
    name,
    emailVerified,
  })

  return NextResponse.json(await joinPayload(user, { joiner }), { headers: NO_STORE })
}
