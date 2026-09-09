import { NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { pollCibaForClaim } from '@/lib/ciba-flow'
import { getClaim } from '@/lib/claims'
import { isAdmin } from '@/lib/host'
import { isCibaCatchUpWindow } from '@/lib/board-config'
import { buildClaimSnapshot } from '@/lib/snapshot'
import type { ClaimSnapshot } from '@/lib/types'

/**
 * The polling endpoint. Stands in for the AppSync Events subscription the Vite
 * app opened on `interviewDemo/attendee` — the client asks for the whole claim
 * snapshot on an interval instead of reacting to pushed events.
 *
 * Host sessions tick due CIBA auth_req_ids (stored interval, floor 5s).
 * Audience GETs read Neon only — they must not hammer /oauth/token.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth0.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params
  let claim = await getClaim(id)

  if (!claim || claim.userId !== session.user.sub) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const hostPolling = isAdmin(session.user)
  if (hostPolling && isCibaCatchUpWindow(claim)) {
    claim = (await pollCibaForClaim(claim.id, session.user)) ?? claim
  }

  const snapshot: ClaimSnapshot = await buildClaimSnapshot(claim)
  return NextResponse.json(snapshot)
}
