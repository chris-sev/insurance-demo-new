import { getCurrentBoard, withoutHost } from '@/lib/board'
import { boardRulesForClaim, getDemoHost } from '@/lib/board-config'
import { listCibaForClaim, toCibaMember } from '@/lib/ciba-store'
import { listMessages } from '@/lib/claims'
import { isGoogleConnected } from '@/lib/google'
import { claimCode, type CibaBoardSnapshot, type Claim, type ClaimSnapshot } from '@/lib/types'

export async function getCibaBoardSnapshot(claim: Claim): Promise<CibaBoardSnapshot> {
  const [{ boardSize, yesThreshold }, host] = await Promise.all([
    boardRulesForClaim(claim),
    getDemoHost(),
  ])
  const rows = await listCibaForClaim(claim.id)
  const members = withoutHost(rows.map(toCibaMember), host)
  if (members.length > 0) {
    return {
      members,
      approvedCount: members.filter((m) => m.status === 'approved').length,
      requiredApprovals: yesThreshold,
      boardSize,
      blockReason: claim.cibaBlockReason,
      calendarEventId: claim.calendarEventId,
      started: true,
    }
  }

  const seated = withoutHost(await getCurrentBoard(), host)
  return {
    members: seated.map((m) => ({
      sub: m.sub,
      email: m.email,
      name: m.name,
      status: 'pending' as const,
    })),
    approvedCount: 0,
    requiredApprovals: yesThreshold,
    boardSize,
    blockReason: claim.cibaBlockReason,
    calendarEventId: claim.calendarEventId,
    started: false,
  }
}

/** Shared claim shape for GET /api/board and POST /api/showcase. */
export async function claimForBoard(claim: Claim) {
  return {
    id: claim.id,
    code: claimCode(claim.id),
    status: claim.status,
    policyId: claim.policyId,
    incidentDescription: claim.incidentDescription,
    calendarEventId: claim.calendarEventId,
    createdAt: claim.createdAt,
    requestedAmount: claim.requestedAmount,
    customerName: claim.customerName,
    stages: claim.stages,
    decision: claim.decision,
    board: await getCibaBoardSnapshot(claim),
  }
}

export async function buildClaimSnapshot(claim: Claim): Promise<ClaimSnapshot> {
  const [messages, board, googleConnected] = await Promise.all([
    listMessages(claim.id),
    getCibaBoardSnapshot(claim),
    isGoogleConnected(),
  ])

  return {
    claim,
    messages,
    approvalCount: board.approvedCount,
    board,
    googleConnected,
  }
}
