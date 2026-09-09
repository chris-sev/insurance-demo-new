import { NextResponse } from 'next/server'
import { requireHostSession } from '@/lib/api-auth'
import { eligibleJoiners, getCurrentBoard, listJoiners, withoutHost } from '@/lib/board'
import { autoStartCibaFromHostPoll, pollCibaForClaim } from '@/lib/ciba-flow'
import { getClaim, getLatestSubmittedClaim } from '@/lib/claims'
import { isGoogleConnected } from '@/lib/google'
import {
  getBoardSettings,
  getDemoHost,
  hasCibaCatchUpLock,
  isCibaCatchUpWindow,
} from '@/lib/board-config'
import { hasLiveCiba } from '@/lib/ciba-store'
import { getCibaBoardSnapshot } from '@/lib/snapshot'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireHostSession()
  if ('error' in auth) return auth.error

  let claim = await getLatestSubmittedClaim()
  // Host session only. Same startCibaForSubmittedClaim as POST /api/ciba
  // and the claims agent. already_started / hasLiveCiba is a no-op.
  const cibaAutoStart = await autoStartCibaFromHostPoll(claim)
  if (cibaAutoStart && claim) {
    claim = (await getClaim(claim.id)) ?? claim
  }
  if (claim && isCibaCatchUpWindow(claim)) {
    claim = (await pollCibaForClaim(claim.id, auth.session.user)) ?? claim
  }

  const [joiners, board, googleConnected, rulesLocked, cibaLive, settings, demoHost] =
    await Promise.all([
      listJoiners(),
      getCurrentBoard(),
      isGoogleConnected(),
      hasCibaCatchUpLock(),
      hasLiveCiba(),
      getBoardSettings(),
      getDemoHost(),
    ])

  return NextResponse.json(
    {
      joiners: withoutHost(joiners, demoHost),
      board,
      boardSize: settings.boardSize,
      yesThreshold: settings.yesThreshold,
      demoHostEmail: demoHost.email,
      demoHostSub: demoHost.sub,
      verifiedCount: eligibleJoiners(joiners, demoHost).length,
      canPick: !cibaLive,
      canChangeRules: !rulesLocked,
      googleConnected,
      cibaAutoStart,
      claim: claim
        ? {
            id: claim.id,
            status: claim.status,
            policyId: claim.policyId,
            incidentDescription: claim.incidentDescription,
            calendarEventId: claim.calendarEventId,
            board: await getCibaBoardSnapshot(claim),
          }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  )
}
