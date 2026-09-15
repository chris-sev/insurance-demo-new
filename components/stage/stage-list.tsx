import { CheckCircle2, Flag, TriangleAlert } from 'lucide-react'
import { STAGES, type ClaimStage, type ClaimStatus } from '@/lib/types'

type RowStatus = 'waiting' | 'running' | 'done' | 'flagged'

/** Stages are recorded in completion order; match by key, never by position. */
function entryFor(stages: ClaimStage[], key: ClaimStage['key']): ClaimStage | undefined {
  return stages.find((s) => s.key === key)
}

/** First STAGES entry without a record — the one the supervisor is on right now. */
function runningIndexFor(stages: ClaimStage[], claimStatus: ClaimStatus): number {
  if (claimStatus !== 'pending') return -1
  return STAGES.findIndex((stage) => !entryFor(stages, stage.key))
}

function rowStatus(index: number, stages: ClaimStage[], claimStatus: ClaimStatus): RowStatus {
  const entry = entryFor(stages, STAGES[index].key)
  if (entry) return entry.status === 'flagged' ? 'flagged' : 'done'
  return index === runningIndexFor(stages, claimStatus) ? 'running' : 'waiting'
}

/** The five specialist stages, in STAGES order, as hairline-separated rows with live status. */
export function StageList({ stages, status }: { stages: ClaimStage[]; status: ClaimStatus }) {
  return (
    <ol className="border-t border-border">
      {STAGES.map((stage, index) => {
        const rs = rowStatus(index, stages, status)
        const entry = entryFor(stages, stage.key)
        return (
          <li
            key={stage.key}
            className={`flex items-center gap-5 border-b border-border py-5.5 ${rs === 'waiting' ? 'opacity-45' : ''}`}
          >
            <span className="hud-readout w-9 shrink-0 text-base text-muted-foreground">
              {String(index + 1).padStart(2, '0')}
            </span>
            <span className="flex w-9 shrink-0 justify-center">
              <StatusMark status={rs} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[1.75rem] font-bold uppercase leading-tight text-foreground">
                {stage.label}
              </p>
              <p className={`mt-1 text-lg ${statusTextClass(rs)}`}>
                {rs === 'done' || rs === 'flagged'
                  ? entry?.summary
                  : rs === 'running'
                    ? 'Running…'
                    : 'Waiting'}
              </p>
            </div>
            <span className="hud-readout shrink-0 text-base text-muted-foreground">
              {stage.tool}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/** Compact chip row — used once a claim has moved past active processing (the exception stage). */
export function StageChips({ stages, status }: { stages: ClaimStage[]; status: ClaimStatus }) {
  return (
    <ul className="flex flex-wrap items-center gap-3">
      {STAGES.map((stage, index) => {
        const rs = rowStatus(index, stages, status)
        const short = stage.label.replace(/ Specialist$/, '')
        return (
          <li
            key={stage.key}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
              rs === 'flagged'
                ? 'border-gold bg-gold/10 text-gold'
                : rs === 'done'
                  ? 'border-border bg-card text-foreground'
                  : 'border-border/50 text-muted-foreground/70'
            }`}
          >
            {rs === 'flagged' ? (
              <Flag className="h-3.5 w-3.5" />
            ) : rs === 'done' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-stone-time" />
            ) : (
              <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-current" />
            )}
            {rs === 'flagged' ? `${short} · flagged` : short}
          </li>
        )
      })}
    </ul>
  )
}

function statusTextClass(status: RowStatus): string {
  if (status === 'flagged') return 'text-gold'
  if (status === 'running') return 'text-hud'
  if (status === 'done') return 'text-stone-time'
  return 'text-muted-foreground/70'
}

function StatusMark({ status }: { status: RowStatus }) {
  if (status === 'done') {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-stone-time" />
  }
  if (status === 'flagged') {
    return <TriangleAlert className="h-5 w-5 shrink-0 text-gold" />
  }
  if (status === 'running') {
    return (
      <span
        aria-hidden
        className="arc-reactor h-5 w-5 shrink-0"
        style={{ animationDuration: '1.4s' }}
      />
    )
  }
  return null
}

/** "Customer request → Claims Supervisor → Specialist → Company tool" with the current name in. */
export function IdentityChain({ stages, status }: { stages: ClaimStage[]; status: ClaimStatus }) {
  const runningIndex = runningIndexFor(stages, status)
  const lastDone = [...STAGES].reverse().find((stage) => entryFor(stages, stage.key))
  const currentStage = runningIndex >= 0 ? STAGES[runningIndex] : (lastDone ?? STAGES[0])

  return (
    <p className="hud-readout text-center text-lg text-muted-foreground">
      Customer request <span className="text-hud">&rarr;</span> Claims Supervisor{' '}
      <span className="text-hud">&rarr;</span> {currentStage.label}{' '}
      <span className="text-hud">&rarr;</span> Company tool
    </p>
  )
}
