import { CheckCircle2, Mail, MinusCircle, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StageChips } from '@/components/stage/stage-list'
import { formatMoney } from '@/components/stage/format'
import {
  HUMAN_AUTHORITY_THRESHOLD,
  type CibaBoardMember,
  type CibaBoardSnapshot,
  type ClaimStage,
  type ClaimStatus,
} from '@/lib/types'

const PILL_COLOR: Record<CibaBoardMember['status'], string> = {
  pending: 'var(--gold)',
  approved: 'var(--stone-time)',
  denied: 'var(--primary)',
  error: 'var(--primary)',
}

const PILL_LABEL: Record<CibaBoardMember['status'], string> = {
  pending: 'Pending',
  approved: 'Approved',
  denied: 'Declined',
  error: 'Error',
}

function statusLine(member: CibaBoardMember): string {
  if (member.status === 'approved') return 'Approved the CIBA request'
  if (member.status === 'denied') return 'Declined the CIBA request'
  if (member.status === 'error') return member.error || 'Auth0 did not accept the CIBA grant'
  return 'Auth0 CIBA approval email sent'
}

/** The human authority boundary: amount over the threshold, waiting on the approver seat. */
export function ExceptionPanel({
  amount,
  approverName,
  board,
  stages,
  status,
  showSendCiba,
  sending,
  sendDisabled,
  failWhy,
  onSendCiba,
}: {
  amount: number
  approverName: string
  board: CibaBoardSnapshot
  stages: ClaimStage[]
  status: ClaimStatus
  showSendCiba: boolean
  sending: boolean
  sendDisabled: boolean
  failWhy: string | null
  onSendCiba: () => void
}) {
  const rows: CibaBoardMember[] =
    board.members.length > 0
      ? board.members
      : [{ sub: 'pending', name: approverName, email: '', status: 'pending' }]

  return (
    <div className="space-y-8">
      <div className="space-y-3.5 rounded-2xl border-2 border-primary/70 bg-primary/10 p-8 sm:p-11">
        <p className="font-display font-bold uppercase leading-[1.05] text-primary text-[clamp(2.5rem,7vw,4rem)]">
          Exception: human authorization required
        </p>
        <p className="text-xl leading-relaxed text-foreground sm:text-2xl">
          {formatMoney(amount)} is above the {formatMoney(HUMAN_AUTHORITY_THRESHOLD)} authority
          limit. Auth0 sent an approval email to {approverName}.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-8">
        <span className="hud-label text-[13px]">Human approver</span>
        <div className="space-y-4">
          {rows.map((member) => (
            <div
              key={member.sub}
              className="flex flex-wrap items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <p className="font-display text-2xl font-bold text-foreground sm:text-[26px]">
                  {member.name}
                </p>
                <p className="text-base text-muted-foreground">{statusLine(member)}</p>
              </div>
              <ApproverPill status={member.status} />
            </div>
          ))}
        </div>

        {showSendCiba && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
            <p className="text-[15px] text-muted-foreground">
              {failWhy ?? "If the email doesn't arrive, use the fallback link below."}
            </p>
            <Button variant="outline" onClick={onSendCiba} disabled={sending || sendDisabled}>
              {sending ? 'Sending…' : 'Send CIBA fallback'}
            </Button>
          </div>
        )}
      </div>

      <StageChips stages={stages} status={status} />
    </div>
  )
}

function ApproverPill({ status }: { status: CibaBoardMember['status'] }) {
  const color = PILL_COLOR[status]
  const Icon =
    status === 'approved'
      ? CheckCircle2
      : status === 'denied'
        ? MinusCircle
        : status === 'error'
          ? TriangleAlert
          : Mail
  return (
    <span
      className="hud-label inline-flex shrink-0 items-center gap-2.5 rounded-full border px-4.5 py-2.5 text-[15px]"
      style={{ borderColor: color, color }}
    >
      <Icon className="h-4 w-4" />
      {PILL_LABEL[status]}
    </span>
  )
}
