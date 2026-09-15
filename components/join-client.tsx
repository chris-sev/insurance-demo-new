'use client'

import { useEffect, useState } from 'react'
import { Check, Mail, Radar, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCompactMoney, formatMoney } from '@/components/stage/format'
import type { ClaimDecision, ClaimStatus } from '@/lib/types'

/** Typed locally against the /api/join contract (lib/types.ts is locked). */
type JoinState = {
  host: boolean
  onBoard: boolean
  ciba: { status: string; bindingMessage: string; error: string | null } | null
  request: { amount: number; reason: string } | null
  room: { joined: number; requests: number; totalRequested: number }
  showcase: null | {
    mine: boolean
    code: string
    amount: number
    status: ClaimStatus
    decision: ClaimDecision
    customerName: string
  }
}

const POLL_MS = 2000
const AMOUNT_MIN = 1
const AMOUNT_MAX = 1_000_000_000

const SHOWCASE_STATUS_TEXT: Record<ClaimStatus, string> = {
  pending: 'Processing…',
  awaiting_approval: 'Waiting for a human approver',
  approved: 'Approved',
  denied: 'Declined',
}

/** Panel accent per claim status — gold while it's live on stage, green/red once decided. */
const SHOWCASE_PANEL: Record<ClaimStatus, { border: string; bg: string; text: string }> = {
  pending: { border: 'border-hud/60', bg: 'bg-hud/10', text: 'text-hud' },
  awaiting_approval: { border: 'border-gold', bg: 'bg-gold/10', text: 'text-gold' },
  approved: { border: 'border-stone-time/60', bg: 'bg-stone-time/10', text: 'text-stone-time' },
  denied: { border: 'border-destructive/60', bg: 'bg-destructive/10', text: 'text-destructive' },
}

export function JoinLogin({ authError }: { authError: string | null }) {
  return (
    <JoinShell banner={authError}>
      <Card>
        <div className="flex flex-col items-center gap-4 py-14 text-center">
          <Radar className="h-10 w-10 text-hud" />
          <div className="w-full">
            <h1 className="font-display text-2xl font-bold uppercase text-foreground">
              Join the room
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-base text-muted-foreground">
              Sign in with Auth0 to file a claim from your seat.
            </p>
          </div>
          <Button asChild className="h-12 min-w-40 rounded-lg text-sm normal-case tracking-normal">
            <a href="/auth/login?returnTo=/join">Sign in</a>
          </Button>
        </div>
      </Card>
    </JoinShell>
  )
}

export function JoinClient({
  userEmail,
  authError,
}: {
  userEmail: string
  authError?: string | null
}) {
  const [state, setState] = useState<JoinState | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)

  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let active = true
    let joined = false

    const apply = (next: JoinState) => {
      if (!active) return
      setState(next)
      setPollError(null)
    }

    const read = async () => {
      const res = await fetch(`/api/join?ts=${Date.now()}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Status ${res.status}`)
      apply((await res.json()) as JoinState)
    }

    const tick = async () => {
      try {
        if (!joined) {
          const posted = await fetch('/api/join', { method: 'POST', cache: 'no-store' })
          if (!posted.ok && posted.status !== 409) {
            const body = await posted.json().catch(() => ({}))
            throw new Error(body.error || `Join failed (${posted.status})`)
          }
          if (posted.ok) apply((await posted.json()) as JoinState)
          joined = true
        }
        await read()
      } catch (err) {
        if (active) setPollError(err instanceof Error ? err.message : 'Join failed')
      }
    }

    void tick()
    const timer = setInterval(() => void tick(), POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [])

  const submitClaim = async () => {
    setFormError(null)
    const amountNum = Number(amount)
    if (!Number.isInteger(amountNum) || amountNum < AMOUNT_MIN || amountNum > AMOUNT_MAX) {
      setFormError('Enter a whole dollar amount between $1 and $1,000,000,000.')
      return
    }
    const trimmedReason = reason.trim()
    if (trimmedReason.length < 3 || trimmedReason.length > 200) {
      setFormError('Tell us what happened in 3 to 200 characters.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountNum, reason: trimmedReason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFormError(body.error || `Submit failed (${res.status})`)
        return
      }
      setState(body as JoinState)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (!state) {
    return (
      <JoinShell banner={authError}>
        <Card>
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="relative grid h-16 w-16 place-items-center">
              <span className="absolute inset-0 rounded-full border border-dashed border-hud/40 [animation:spin_8s_linear_infinite]" />
              <Radar className="h-7 w-7 text-hud/70" />
            </span>
            <div className="w-full">
              <h1 className="font-display text-xl font-bold uppercase text-foreground">
                Connecting…
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-base text-muted-foreground">
                {pollError ?? 'Getting the room ready.'}
              </p>
            </div>
          </div>
        </Card>
      </JoinShell>
    )
  }

  if (state.host) {
    return (
      <JoinShell banner={authError}>
        <Card>
          <div className="flex flex-col items-center gap-4 py-14 text-center">
            <ShieldCheck className="h-10 w-10 text-gold" />
            <div className="w-full">
              <h1 className="font-display text-2xl font-bold uppercase text-foreground">
                You are the operator
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-base text-muted-foreground">
                This QR is for the room. Open the control room to run the show.
              </p>
            </div>
            <a href="/host" className="text-sm font-semibold text-hud underline underline-offset-4">
              Open the control room
            </a>
          </div>
        </Card>
      </JoinShell>
    )
  }

  if (state.onBoard) {
    const ciba = state.ciba
    return (
      <JoinShell banner={authError ?? pollError}>
        <Card accent="border-stone-time/50">
          <div className="flex flex-col items-center gap-4 py-12 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-stone-time/15">
              <Check className="h-8 w-8 text-stone-time" />
            </span>
            <div className="w-full">
              <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-stone-time">
                Human approver
              </span>
              <h1 className="mt-2 font-display text-2xl font-bold uppercase text-foreground">
                You&apos;re the human approver
              </h1>
              <p className="mx-auto mt-2 max-w-sm text-base text-muted-foreground">
                When the room&apos;s request needs authorization, Auth0 will email you. Open it
                and tap Approve.
              </p>
            </div>
          </div>
          <div className="space-y-3 pb-2 text-center">
            {ciba?.status === 'pending' && (
              <p className="flex items-center justify-center gap-2 text-sm text-gold">
                <Mail className="h-4 w-4" />
                Check {userEmail} — the approval email is on its way.
              </p>
            )}
            {ciba?.status === 'approved' && (
              <p className="text-sm font-semibold text-stone-time">You approved this claim</p>
            )}
            {ciba?.status === 'denied' && (
              <p className="text-sm font-semibold text-destructive">You declined this claim</p>
            )}
            {ciba?.status === 'error' && (
              <p className="flex items-center justify-center gap-2 text-sm text-destructive">
                <TriangleAlert className="h-4 w-4" />
                {ciba.error
                  ? `Approval email failed: ${ciba.error}`
                  : 'Approval email failed. Tell the operator — your inbox was not reached.'}
              </p>
            )}
            {ciba?.bindingMessage && (
              <p className="hud-readout text-xs text-muted-foreground">
                Binding message · {ciba.bindingMessage}
              </p>
            )}
          </div>
        </Card>
      </JoinShell>
    )
  }

  if (state.request) {
    const panel = state.showcase?.mine ? SHOWCASE_PANEL[state.showcase.status] : null
    return (
      <JoinShell banner={authError ?? pollError}>
        <div className="flex flex-col items-center gap-4 pt-6 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-stone-time/15">
            <Check className="h-8 w-8 text-stone-time" />
          </span>
          <div className="w-full">
            <h1 className="font-display text-[36px] font-bold uppercase leading-[1.15] text-foreground">
              You&apos;re in.
            </h1>
            <p className="mt-1 text-lg text-muted-foreground">Watch the room.</p>
          </div>
        </div>

        <div className="mt-7 flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-card px-5 py-4.5">
            <p className="hud-readout font-mono text-[22px] font-semibold text-gold">
              {formatMoney(state.request.amount)}
            </p>
            <p className="text-base text-foreground">&ldquo;{state.request.reason}&rdquo;</p>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            {state.room.joined} {state.room.joined === 1 ? 'person' : 'people'} in the room ·{' '}
            {state.room.requests} {state.room.requests === 1 ? 'request' : 'requests'} ·{' '}
            {formatCompactMoney(state.room.totalRequested)} requested
          </p>
        </div>

        {state.showcase?.mine && panel && (
          <div className={`mt-6 flex flex-col gap-2 rounded-[10px] border p-5 ${panel.border} ${panel.bg}`}>
            <p className={`text-base font-bold ${panel.text}`}>Your request is on stage</p>
            <p className="text-[15px] text-foreground">
              {SHOWCASE_STATUS_TEXT[state.showcase.status]}
            </p>
          </div>
        )}
      </JoinShell>
    )
  }

  return (
    <JoinShell banner={authError ?? pollError}>
      <div className="mb-7">
        <span className="font-mono text-[13px] uppercase tracking-[0.1em] text-hud">
          Your claim
        </span>
        <h1 className="mt-2 font-display text-[32px] font-bold uppercase leading-[1.12] text-foreground">
          How much should Hero Shield reimburse you?
        </h1>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex h-14 items-center gap-2 rounded-[10px] border border-border bg-card px-4.5 focus-within:border-hud">
          <span className="font-display text-[30px] font-bold text-muted-foreground">$</span>
          <input
            id="claim-amount"
            aria-label="Claim amount in dollars"
            type="number"
            inputMode="numeric"
            min={AMOUNT_MIN}
            max={AMOUNT_MAX}
            step={1}
            placeholder="1,000,000"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-full w-full bg-transparent font-display text-[30px] font-bold text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2">
        <label htmlFor="claim-reason" className="text-[15px] font-semibold text-foreground">
          What happened?
        </label>
        <textarea
          id="claim-reason"
          rows={3}
          maxLength={200}
          placeholder="Hulk threw my car."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-[10px] border border-border bg-card px-4 py-3.5 text-lg text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-hud"
        />
        <div className="text-right text-xs text-muted-foreground">{reason.length}/200</div>
      </div>

      {formError && (
        <p className="mt-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button
        type="button"
        variant="gold"
        className="mt-7 h-14 w-full rounded-[10px] text-[17px] font-bold normal-case tracking-normal"
        disabled={submitting}
        onClick={submitClaim}
      >
        {submitting ? 'Submitting…' : 'Submit my claim'}
      </Button>
    </JoinShell>
  )
}

function Card({
  children,
  accent = 'border-transparent',
}: {
  children: React.ReactNode
  accent?: string
}) {
  return (
    <div className={`rounded-[10px] border ${accent} bg-card px-5 sm:px-6`}>{children}</div>
  )
}

function JoinShell({
  children,
  banner,
}: {
  children: React.ReactNode
  banner?: string | null
}) {
  return (
    <div className="relative min-h-screen px-6 py-8">
      <div className="relative mx-auto max-w-md">
        {banner && (
          <p className="mb-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            {banner}
          </p>
        )}
        {children}
      </div>
    </div>
  )
}
