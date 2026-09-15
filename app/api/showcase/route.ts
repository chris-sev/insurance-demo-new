import { NextResponse } from 'next/server'
import { requireHostSession } from '@/lib/api-auth'
import { runSupervisor } from '@/lib/agent/supervisor'
import { generatePolicyId } from '@/lib/auth0'
import { listJoiners, pickShowcaseRequest } from '@/lib/board'
import { createShowcaseClaim, getShowcaseClaim } from '@/lib/claims'
import { claimForBoard } from '@/lib/snapshot'

// The supervisor's own timeout is 45s; this covers Neon round trips around it.
export const maxDuration = 120

/**
 * Operator "Pick showcase request". Picks the room's biggest request (or a
 * specific `sub`), creates the showcase claim, and runs the Claims
 * Supervisor inline before responding — the /host poll then just paints
 * whatever stages/decision landed.
 */
export async function POST(request: Request) {
  const auth = await requireHostSession()
  if ('error' in auth) return auth.error

  if (await getShowcaseClaim()) {
    return NextResponse.json(
      { error: 'A showcase claim is already on stage. Start over first.' },
      { status: 409 },
    )
  }

  const body = (await request.json().catch(() => null)) as { sub?: string } | null
  const joiners = await listJoiners()
  const pick = pickShowcaseRequest(joiners, body?.sub)
  if (!pick || pick.requestedAmount == null) {
    return NextResponse.json({ error: 'No requests in the room yet.' }, { status: 400 })
  }

  const claim = await createShowcaseClaim({
    userId: pick.sub,
    policyId: generatePolicyId(),
    customerName: pick.name,
    requestedAmount: pick.requestedAmount,
    reason: pick.incidentReason ?? '',
  })

  const resolved = await runSupervisor(claim)

  return NextResponse.json({ claim: await claimForBoard(resolved) })
}
