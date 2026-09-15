import { CheckCircle2, Mail, MinusCircle, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { CibaBoardMember, CibaBoardSnapshot } from '@/lib/types'

const STATUS_STONE: Record<CibaBoardMember['status'], string> = {
  pending: 'mind',
  approved: 'time',
  denied: 'reality',
  error: 'power',
}

export function BoardPanel({
  board,
  compact,
  size = 'sm',
}: {
  board: CibaBoardSnapshot
  compact?: boolean
  /** 'lg' bumps every readout up to projector-legible sizes — used on the /host stage. */
  size?: 'sm' | 'lg'
}) {
  const remaining = Math.max(0, board.requiredApprovals - board.approvedCount)
  const progress = (board.approvedCount / board.requiredApprovals) * 100
  const lg = size === 'lg'

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex justify-between">
          <span
            className={`hud-readout uppercase tracking-[0.12em] text-muted-foreground ${lg ? 'text-sm' : 'text-[0.65rem]'}`}
          >
            CIBA board
          </span>
          <span className={`hud-readout text-[var(--stone)] ${lg ? 'text-lg' : 'text-[0.7rem]'}`}>
            {board.approvedCount}/{board.requiredApprovals} yeses
          </span>
        </div>
        <div className={`overflow-hidden rounded-full bg-muted ${lg ? 'h-3' : 'h-2'}`}>
          <div className="energy-fill h-full rounded-full" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <p className={`mt-2 text-muted-foreground ${lg ? 'text-lg' : 'text-xs'}`}>
          {board.started
            ? remaining > 0
              ? `${remaining} more CIBA approval${remaining > 1 ? 's' : ''} to release`
              : 'Threshold met — releasing…'
            : 'Emails go out from the operator console when the claim is submitted.'}
        </p>
      </div>

      <ul className={`grid gap-2 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {board.members.length === 0 && (
          <li className={`text-muted-foreground ${lg ? 'text-lg' : 'text-xs'}`}>No board seated yet.</li>
        )}
        {board.members.map((member) => (
          <BoardSeat key={member.sub} member={member} size={size} />
        ))}
      </ul>
    </div>
  )
}

export function BoardSeat({
  member,
  size = 'sm',
}: {
  member: CibaBoardMember
  size?: 'sm' | 'lg'
}) {
  const lg = size === 'lg'
  return (
    <li
      data-stone={STATUS_STONE[member.status]}
      className={`flex items-center justify-between gap-3 rounded-sm border border-[color-mix(in_oklch,var(--stone)_35%,transparent)] bg-[color-mix(in_oklch,var(--stone)_08%,transparent)] ${lg ? 'px-4 py-3' : 'px-3 py-2'}`}
    >
      <div className="min-w-0">
        <p className={`truncate font-medium text-foreground ${lg ? 'text-xl' : 'text-sm'}`}>
          {member.name}
        </p>
        <p className={`hud-readout truncate text-muted-foreground ${lg ? 'text-sm' : 'text-[0.65rem]'}`}>
          {member.email}
        </p>
      </div>
      <StatusBadge status={member.status} size={size} />
    </li>
  )
}

function StatusBadge({
  status,
  size = 'sm',
}: {
  status: CibaBoardMember['status']
  size?: 'sm' | 'lg'
}) {
  const lgClass = size === 'lg' ? 'px-3 py-1 text-sm [&_svg]:h-4 [&_svg]:w-4' : ''
  if (status === 'approved') {
    return (
      <Badge variant="success" className={`shrink-0 ${lgClass}`}>
        <CheckCircle2 className="h-3 w-3" />
        Approved
      </Badge>
    )
  }
  if (status === 'denied') {
    return (
      <Badge variant="destructive" className={`shrink-0 ${lgClass}`}>
        <MinusCircle className="h-3 w-3" />
        Denied
      </Badge>
    )
  }
  if (status === 'error') {
    return (
      <Badge variant="destructive" className={`shrink-0 ${lgClass}`}>
        <TriangleAlert className="h-3 w-3" />
        Error
      </Badge>
    )
  }
  return (
    <Badge variant="warning" className={`shrink-0 ${lgClass}`}>
      <Mail className="h-3 w-3" />
      Pending
    </Badge>
  )
}
