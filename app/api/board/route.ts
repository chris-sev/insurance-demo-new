import { NextResponse } from 'next/server'
import { requireHostSession } from '@/lib/api-auth'
import { eligibleJoiners, getCurrentBoard, listJoiners, roomStats, withoutHost } from '@/lib/board'
import {
  autoStartCibaFromHostPoll,
  pollCibaForClaim,
  writeHostCalendarEvent,
} from '@/lib/ciba-flow'
import { getClaim, getLatestSubmittedClaim, getShowcaseClaim } from '@/lib/claims'
import { isGoogleConnected } from '@/lib/google'
import {
  getBoardSettings,
  getDemoHost,
  hasCibaCatchUpLock,
  isCibaCatchUpWindow,
} from '@/lib/board-config'
import { hasLiveCiba } from '@/lib/ciba-store'
import { canWriteHostCalendar } from '@/lib/host'
import { claimForBoard } from '@/lib/snapshot'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireHostSession()
  if ('error' in auth) return auth.error

  const demoHost = await getDemoHost()

  // Showcase claim (amount known) wins the projector; else fall back to
  // the employee-built /file-claim chat flow so /host still shows it.
  let claim = (await getShowcaseClaim()) ?? (await getLatestSubmittedClaim())

  // Host session only. Same startCibaForSubmittedClaim as POST /api/ciba
  // and the claims agent. already_started / hasLiveCiba is a no-op.
  const cibaAutoStart = await autoStartCibaFromHostPoll(claim)
  if (cibaAutoStart && claim) {
    claim = (await getClaim(claim.id)) ?? claim
  }
  if (claim && isCibaCatchUpWindow(claim)) {
    claim = (await pollCibaForClaim(claim.id, auth.session.user)) ?? claim
  }
  // Auto-approved showcase claims (amount <= threshold) skip CIBA entirely,
  // so pollCibaForClaim's own calendar write (gated on the CIBA branch)
  // never fires for them — write it here instead.
  if (
    claim &&
    claim.status === 'approved' &&
    !claim.calendarEventId &&
    canWriteHostCalendar(auth.session.user, demoHost)
  ) {
    await writeHostCalendarEvent(claim.id)
    claim = (await getClaim(claim.id)) ?? claim
  }

  const [joiners, board, googleConnected, rulesLocked, cibaLive, settings] = await Promise.all([
    listJoiners(),
    getCurrentBoard(),
    isGoogleConnected(),
    hasCibaCatchUpLock(),
    hasLiveCiba(),
    getBoardSettings(),
  ])

  const selectedSub = claim?.requestedAmount != null ? claim.userId : null

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
      room: await roomStats(joiners, selectedSub),
      claim: claim ? await claimForBoard(claim) : null,
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } },
  )
}
