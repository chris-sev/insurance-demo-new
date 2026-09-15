export type ClaimStatus = 'pending' | 'awaiting_approval' | 'approved' | 'denied'

export type CibaStatus = 'pending' | 'approved' | 'denied' | 'error'

export type CibaBlockReason = 'no_google' | 'no_board'

export type CibaStartFailReason =
  | 'no_google'
  | 'no_board'
  | 'short_board'
  | 'already_started'
  | 'not_host'

export type CibaAutoStart =
  | { ok: true; started: number; seated: number }
  | {
      ok: false
      reason: CibaStartFailReason
      seated?: number
      required?: number
    }

/**
 * Showcase-claim specialist stages. The runtime is ONE Vercel AI SDK
 * supervisor loop (lib/agent/supervisor.ts); each stage is one governed
 * tool call the supervisor makes on behalf of the customer. Never present
 * these as independently running agents.
 */
export type StageKey = 'policy' | 'coverage' | 'risk' | 'repair' | 'customer_update'

export const STAGES: ReadonlyArray<{ key: StageKey; label: string; tool: string }> = [
  { key: 'policy', label: 'Policy Specialist', tool: 'Policy records' },
  { key: 'coverage', label: 'Coverage Specialist', tool: 'Coverage rules' },
  { key: 'risk', label: 'Risk Specialist', tool: 'Fraud & anomaly checks' },
  { key: 'repair', label: 'Repair Specialist', tool: 'Company calendar · Token Vault' },
  { key: 'customer_update', label: 'Customer Update Specialist', tool: 'Customer message' },
]

export interface ClaimStage {
  key: StageKey
  status: 'done' | 'flagged'
  /** One or two plain sentences the projector shows verbatim. */
  summary: string
  at: string
}

/** How the supervisor resolved the amount. Null while stages are running. */
export type ClaimDecision = 'auto_approved' | 'exception' | null

/** Requests above this cross the human authority boundary (CIBA). */
export const HUMAN_AUTHORITY_THRESHOLD = 100_000

/** Stage-friendly id: HS-4A7F. */
export function claimCode(id: string): string {
  return `HS-${id.replace(/-/g, '').slice(0, 4).toUpperCase()}`
}

export interface Claim {
  id: string
  userId: string
  policyId: string
  incidentDescription: string | null
  incidentLocation: string | null
  damageExtent: string | null
  status: ClaimStatus
  fraudFlagged: boolean
  createdAt: string
  calendarEventId: string | null
  cibaBlockReason: CibaBlockReason | null
  /** Frozen at CIBA start. Null until emails go out. */
  cibaBoardSize: number | null
  cibaYesThreshold: number | null
  /** Showcase request fields. Null for a chat-filed claim on /file-claim. */
  requestedAmount: number | null
  customerName: string | null
  stages: ClaimStage[]
  decision: ClaimDecision
}

/** One audience request, as shown in the room queue on /host. */
export interface RoomRequest {
  sub: string
  name: string
  amount: number
  reason: string
  requestedAt: string
  /** True when this request is the claim the projector is processing. */
  selected: boolean
}

export interface RoomStats {
  joined: number
  requests: number
  totalRequested: number
  /** Largest first, then earliest. Capped at 8. */
  queue: RoomRequest[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CibaBoardMember {
  sub: string
  email: string
  name: string
  status: CibaStatus
  bindingMessage?: string
  error?: string | null
}

export interface CibaBoardSnapshot {
  members: CibaBoardMember[]
  approvedCount: number
  requiredApprovals: number
  boardSize: number
  blockReason: CibaBlockReason | null
  calendarEventId: string | null
  started: boolean
}

/** The claim page polls this; it replaces the AppSync Events subscription. */
export interface ClaimSnapshot {
  claim: Claim
  messages: ChatMessage[]
  /** CIBA yeses — this is the grant. */
  approvalCount: number
  board: CibaBoardSnapshot
  googleConnected: boolean
}

/**
 * Rehearsal defaults for the CIBA board. Live size and yes-threshold
 * are stored in demo_settings and edited on /host. Focus raises to
 * 6 / 3 for the stage talk. Clients must read the values from the
 * API / claim snapshot.
 */
export const DEFAULT_BOARD_SIZE = 1
export const DEFAULT_CIBA_YES_THRESHOLD = 1
export const MAX_BOARD_SIZE = 24
