'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Pin,
  PinOff,
  Shuffle,
  SlidersHorizontal,
  TriangleAlert,
  UserRound,
} from 'lucide-react'
import { ClearClaimButton } from '@/components/clear-claim-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ExceptionPanel } from '@/components/stage/exception-panel'
import { firstName } from '@/components/stage/format'
import { IntakeStage } from '@/components/stage/intake-stage'
import { OutcomePanel } from '@/components/stage/outcome-panel'
import { RequestQueueCompact } from '@/components/stage/request-queue'
import { ShowcaseHeader } from '@/components/stage/showcase-header'
import { IdentityChain, StageList } from '@/components/stage/stage-list'
import {
  DEFAULT_BOARD_SIZE,
  DEFAULT_CIBA_YES_THRESHOLD,
  MAX_BOARD_SIZE,
  type CibaAutoStart,
  type CibaBoardSnapshot,
  type ClaimDecision,
  type ClaimStage,
  type ClaimStatus,
  type RoomStats,
} from '@/lib/types'

type Joiner = {
  sub: string
  email: string
  name: string
  emailVerified: boolean
  pinned: boolean
}

type Claim = {
  id: string
  code: string
  status: ClaimStatus
  policyId: string
  incidentDescription: string | null
  calendarEventId: string | null
  createdAt: string
  requestedAmount: number | null
  customerName: string | null
  stages: ClaimStage[]
  decision: ClaimDecision
  board: CibaBoardSnapshot
}

type BoardState = {
  joiners: Joiner[]
  board: { sub: string; email: string; name: string }[]
  boardSize: number
  yesThreshold: number
  verifiedCount: number
  canPick: boolean
  canChangeRules?: boolean
  googleConnected: boolean
  demoHostEmail: string | null
  demoHostSub: string | null
  cibaAutoStart?: CibaAutoStart | null
  room: RoomStats
  claim: Claim | null
}

const EMPTY_ROOM: RoomStats = { joined: 0, requests: 0, totalRequested: 0, queue: [] }
const POLL_MS = 2000
const CLEAR_REQUESTS_CONFIRM =
  'Clear every request the room has submitted? Joiners stay in the room; only their claim requests are wiped.'

export function HostClient({
  qrDataUrl,
  joinUrl,
  sessionEmail,
  sessionSub,
}: {
  qrDataUrl: string
  joinUrl: string
  sessionEmail: string
  sessionSub: string
}) {
  const [state, setState] = useState<BoardState | null>(null)
  const [seating, setSeating] = useState(false)
  const [starting, setStarting] = useState(false)
  const [savingRules, setSavingRules] = useState(false)
  const [savingHost, setSavingHost] = useState(false)
  const [pickingShowcase, setPickingShowcase] = useState(false)
  const [clearingRequests, setClearingRequests] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftSize, setDraftSize] = useState(DEFAULT_BOARD_SIZE)
  const [draftThreshold, setDraftThreshold] = useState(DEFAULT_CIBA_YES_THRESHOLD)
  const [draftHostEmail, setDraftHostEmail] = useState(sessionEmail)
  const [draftHostSub, setDraftHostSub] = useState(sessionSub)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const syncedRules = useRef<string | null>(null)
  const syncedHost = useRef<string | null>(null)
  const autoOpenDecided = useRef(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/board?ts=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Board ${res.status}`)
    }
    const next = (await res.json()) as BoardState
    setState(next)
    const key = `${next.boardSize}:${next.yesThreshold}`
    if (syncedRules.current !== key) {
      syncedRules.current = key
      setDraftSize(next.boardSize)
      setDraftThreshold(next.yesThreshold)
    }
    const hostKey = `${next.demoHostEmail ?? ''}:${next.demoHostSub ?? ''}`
    if (syncedHost.current !== hostKey) {
      syncedHost.current = hostKey
      setDraftHostEmail(next.demoHostEmail || sessionEmail)
      setDraftHostSub(next.demoHostSub || sessionSub)
    }
    if (!autoOpenDecided.current) {
      autoOpenDecided.current = true
      const noHost = !next.demoHostEmail && !next.demoHostSub
      if (!next.googleConnected || noHost) setDrawerOpen(true)
    }
  }, [sessionEmail, sessionSub])

  useEffect(() => {
    let active = true
    let inFlight = false
    const tick = () => {
      if (inFlight) return
      inFlight = true
      load()
        .then(() => {
          if (active) setError(null)
        })
        .catch((err) => {
          if (active) setError(err instanceof Error ? err.message : 'Load failed')
        })
        .finally(() => {
          inFlight = false
        })
    }
    tick()
    const timer = setInterval(tick, POLL_MS)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [load])

  const seatApprover = async () => {
    setSeating(true)
    try {
      const res = await fetch('/api/board/pick', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Seat approver failed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seat approver failed')
    } finally {
      setSeating(false)
    }
  }

  const pin = async (sub: string, pinned: boolean) => {
    await fetch('/api/board/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub, pinned }),
    })
    await load()
  }

  const saveRules = async () => {
    setSavingRules(true)
    try {
      const res = await fetch('/api/board/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardSize: draftSize, yesThreshold: draftThreshold }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Save failed')
      syncedRules.current = null
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingRules(false)
    }
  }

  const saveHost = async () => {
    setSavingHost(true)
    try {
      const res = await fetch('/api/board/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: draftHostEmail, sub: draftHostSub }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Save failed')
      syncedHost.current = null
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingHost(false)
    }
  }

  const startCiba = async () => {
    setStarting(true)
    try {
      const res = await fetch('/api/ciba', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'CIBA start failed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CIBA start failed')
    } finally {
      setStarting(false)
    }
  }

  const pickShowcase = async (sub?: string) => {
    setPickingShowcase(true)
    setError(null)
    try {
      const res = await fetch('/api/showcase', {
        method: 'POST',
        headers: sub ? { 'Content-Type': 'application/json' } : undefined,
        body: sub ? JSON.stringify({ sub }) : undefined,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Pick showcase request failed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pick showcase request failed')
    } finally {
      setPickingShowcase(false)
    }
  }

  const clearRequests = async () => {
    if (!window.confirm(CLEAR_REQUESTS_CONFIRM)) return
    setClearingRequests(true)
    try {
      const res = await fetch('/api/join/clear', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Clear failed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setClearingRequests(false)
    }
  }

  const boardSize = state?.boardSize ?? DEFAULT_BOARD_SIZE
  const yesThreshold = state?.yesThreshold ?? DEFAULT_CIBA_YES_THRESHOLD
  const verified = state?.joiners.filter((j) => j.emailVerified) ?? []
  const unverified = state?.joiners.filter((j) => !j.emailVerified) ?? []
  const verifiedCount = state?.verifiedCount ?? verified.length
  const enoughVerified = verifiedCount >= boardSize
  const seatEnabled = Boolean(state?.canPick) && enoughVerified && !seating
  const fullBoard = (state?.board.length ?? 0) === boardSize
  const rulesEnabled = Boolean(state?.canChangeRules ?? state?.canPick) && !savingRules
  const rulesInvalid =
    !Number.isInteger(draftSize) ||
    draftSize < 1 ||
    draftSize > MAX_BOARD_SIZE ||
    !Number.isInteger(draftThreshold) ||
    draftThreshold < 1 ||
    draftThreshold > draftSize
  const rulesDirty =
    state != null && (draftSize !== state.boardSize || draftThreshold !== state.yesThreshold)
  const savedHostEmail = state?.demoHostEmail ?? ''
  const savedHostSub = state?.demoHostSub ?? ''
  const hostDirty =
    draftHostEmail.trim().toLowerCase() !== savedHostEmail || draftHostSub.trim() !== savedHostSub
  const hostIncomplete = !draftHostEmail.trim() && !draftHostSub.trim()

  const claim = state?.claim ?? null
  // Only a claim with an amount/customer on it came from the showcase flow (POST
  // /api/showcase); an older /file-claim chat claim can still surface here per the
  // API contract, and it never has these fields set.
  const showcase = claim && claim.requestedAmount != null && claim.customerName != null ? claim : null
  const room = state?.room ?? EMPTY_ROOM
  const otherRequests = Math.max(0, room.requests - (showcase ? 1 : 0))
  const pickShowcaseEnabled = room.requests > 0 && !showcase && !pickingShowcase

  const blockReason = claim?.board.blockReason
  const autoStart = state?.cibaAutoStart ?? null
  const members = claim?.board.members ?? []
  const auth0StartFailed =
    (autoStart?.ok === true && autoStart.started === 0) ||
    Boolean(
      claim?.board.started && members.length > 0 && members.every((m) => m.status === 'error'),
    )
  const autoStartFailed =
    (autoStart != null &&
      !autoStart.ok &&
      autoStart.reason !== 'already_started' &&
      autoStart.reason !== 'not_host') ||
    blockReason === 'no_google' ||
    blockReason === 'no_board' ||
    auth0StartFailed
  const cibaAlreadyLive =
    Boolean(claim?.board.started) &&
    members.some(
      (m) => m.status === 'pending' || m.status === 'approved' || m.status === 'denied',
    )
  const showSendCiba = claim?.status === 'awaiting_approval' && autoStartFailed && !cibaAlreadyLive
  const failReason =
    autoStart && !autoStart.ok
      ? autoStart.reason
      : auth0StartFailed
        ? 'auth0'
        : blockReason
  const failWhy =
    failReason === 'no_google' || blockReason === 'no_google'
      ? `Claim is waiting. Connect Google Calendar — CIBA starts automatically once it is live.`
      : failReason === 'short_board'
        ? `Claim is waiting. Seated board is ${autoStart && !autoStart.ok ? autoStart.seated : members.length}, need exactly ${autoStart && !autoStart.ok ? autoStart.required : boardSize}. Seat a full approver board.`
        : failReason === 'no_board' || blockReason === 'no_board'
          ? `Claim is waiting. Seat ${boardSize} approver${boardSize === 1 ? '' : 's'}. CIBA starts automatically once the board is full.`
          : failReason === 'auth0'
            ? `Auth0 did not accept the CIBA grant${
                members.find((m) => m.error)?.error
                  ? `: ${members.find((m) => m.error)?.error}`
                  : '.'
              }`
            : null

  const approverName = members[0]?.name ?? 'the human approver'
  const approvedMember = members.find((m) => m.status === 'approved')
  const deniedMember = members.find((m) => m.status === 'denied')
  const authorizedBy =
    showcase?.status === 'approved'
      ? showcase.decision === 'exception'
        ? (approvedMember?.name ?? null)
        : null
      : (deniedMember?.name ?? members[0]?.name ?? null)

  return (
    <div className="hud-grid relative min-h-screen overflow-hidden">
      <div className="animate-rise relative flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/60 px-4 py-4 sm:px-8 lg:px-12">
        <span className="hud-label flex items-center gap-2 text-[13px]">
          <span className="h-1.5 w-1.5 animate-blink rounded-full bg-hud" />
          Control room &middot; live
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Pre-show settings
          </Button>
          <ClearClaimButton variant="outline" size="default" onCleared={load} />
          {!showcase && (
            <Button
              variant="gold"
              onClick={() => void pickShowcase()}
              disabled={!pickShowcaseEnabled}
            >
              {pickingShowcase ? 'Picking…' : 'Pick showcase request'}
            </Button>
          )}
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-10 sm:px-8 sm:py-14 lg:px-12">
        {error && (
          <p className="mb-6 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <details
          open={drawerOpen}
          onToggle={(e) => setDrawerOpen(e.currentTarget.open)}
          className="animate-rise mb-10"
        >
          <summary className="sr-only cursor-pointer list-none">Pre-show settings</summary>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="hud-panel rounded-none border-transparent">
              <CardHeader className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base uppercase">
                      Google Calendar &middot; Token Vault
                    </CardTitle>
                    <CardDescription>
                      The Repair Specialist writes the approved-claim event here.
                    </CardDescription>
                  </div>
                  {state?.googleConnected ? (
                    <span className="hud-label rounded-sm border border-stone-time/45 bg-stone-time/10 px-2 py-1 text-stone-time">
                      Connected
                    </span>
                  ) : (
                    <span className="hud-label rounded-sm border border-gold/45 bg-gold/10 px-2 py-1 text-gold">
                      Not connected
                    </span>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                {!state?.googleConnected && (
                  <p className="mb-3 text-sm text-muted-foreground">
                    CIBA emails will not go out until this is connected — otherwise a yes has
                    nowhere to write the calendar event.
                  </p>
                )}
                <Button asChild variant={state?.googleConnected ? 'outline' : 'gold'} size="sm">
                  <Link href="/settings">
                    {state?.googleConnected ? 'Manage connection' : 'Connect Google Calendar'}
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="hud-panel rounded-none border-transparent">
              <CardHeader className="pt-5">
                <CardTitle className="flex items-center gap-2 text-base uppercase">
                  <UserRound className="h-4 w-4 text-hud" />
                  Demo host
                </CardTitle>
                <CardDescription>
                  The presenter on stage — excluded from the approver seats, and the
                  Google Calendar that receives the approved-claim event.
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="hud-label text-[0.6rem]">Demo host email</span>
                    <input
                      type="email"
                      value={draftHostEmail}
                      onChange={(e) => setDraftHostEmail(e.target.value)}
                      placeholder={sessionEmail || 'presenter@okta.com'}
                      className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:border-hud/60 focus:outline-none focus:ring-2 focus:ring-hud/30"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="hud-label text-[0.6rem]">Demo host sub</span>
                    <input
                      type="text"
                      value={draftHostSub}
                      onChange={(e) => setDraftHostSub(e.target.value)}
                      placeholder={sessionSub}
                      className="w-full rounded-md border border-input bg-background/60 px-3 py-2 font-mono text-sm focus:border-hud/60 focus:outline-none focus:ring-2 focus:ring-hud/30"
                    />
                  </label>
                </div>
                {hostIncomplete && (
                  <p className="text-xs text-gold">
                    Save the presenter email or Auth0 sub before you seat an approver.
                  </p>
                )}
                <Button
                  onClick={() => void saveHost()}
                  disabled={savingHost || hostIncomplete || !hostDirty}
                >
                  {savingHost ? 'Saving…' : 'Save demo host'}
                </Button>
              </CardContent>
            </Card>

            <Card className="hud-panel rounded-none border-transparent lg:col-span-2">
              <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
                <div>
                  <CardTitle className="text-base uppercase">Human approver seat</CardTitle>
                  <CardDescription>
                    {verifiedCount}/{boardSize} verified &middot; select who sits, then seat them
                  </CardDescription>
                </div>
                <Button onClick={() => void seatApprover()} disabled={!seatEnabled}>
                  <Shuffle className="h-4 w-4" />
                  {seating ? 'Seating…' : 'Seat approver'}
                </Button>
              </CardHeader>
              <Separator />
              <CardContent className="space-y-2 pt-4">
                {state === null && <p className="hud-label animate-blink">Syncing room…</p>}
                {state?.joiners.length === 0 && (
                  <p className="text-sm text-muted-foreground">No one has scanned in yet.</p>
                )}
                {verified.map((joiner) => (
                  <div
                    key={joiner.sub}
                    className="flex items-center justify-between gap-3 rounded-sm border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{joiner.name}</p>
                      <p className="hud-readout truncate text-[0.65rem] text-muted-foreground">
                        {joiner.email}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={joiner.pinned ? 'gold' : 'outline'}
                      onClick={() => void pin(joiner.sub, !joiner.pinned)}
                    >
                      {joiner.pinned ? <Pin className="h-3 w-3" /> : <PinOff className="h-3 w-3" />}
                      {joiner.pinned ? 'Deselect' : 'Select'}
                    </Button>
                  </div>
                ))}
                {unverified.length > 0 && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    {unverified.length} unverified — they can watch, they cannot sit.
                  </p>
                )}
                {state && !enoughVerified && (
                  <p className="text-xs text-gold">
                    Need {boardSize} verified joiners before you can seat. A short board can
                    never hit {yesThreshold} approval{yesThreshold === 1 ? '' : 's'}.
                  </p>
                )}
                {state?.canPick === false && (
                  <p className="text-xs text-gold">
                    CIBA emails are already out. Start over before seating again.
                  </p>
                )}

                <Separator className="my-2" />

                <div className="grid gap-4 pt-2 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="hud-label text-[0.6rem]">Approver seats</span>
                    <input
                      type="number"
                      min={1}
                      max={MAX_BOARD_SIZE}
                      step={1}
                      value={Number.isFinite(draftSize) ? draftSize : ''}
                      disabled={!rulesEnabled}
                      onChange={(e) => setDraftSize(Number(e.target.value))}
                      className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:border-hud/60 focus:outline-none focus:ring-2 focus:ring-hud/30"
                    />
                  </label>
                  <label className="space-y-1.5 text-sm">
                    <span className="hud-label text-[0.6rem]">Approvals needed</span>
                    <input
                      type="number"
                      min={1}
                      max={Number.isFinite(draftSize) ? draftSize : MAX_BOARD_SIZE}
                      step={1}
                      value={Number.isFinite(draftThreshold) ? draftThreshold : ''}
                      disabled={!rulesEnabled}
                      onChange={(e) => setDraftThreshold(Number(e.target.value))}
                      className="w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm focus:border-hud/60 focus:outline-none focus:ring-2 focus:ring-hud/30"
                    />
                  </label>
                </div>
                {rulesInvalid && (
                  <p className="text-xs text-gold">
                    Approvals needed must be at least 1 and cannot exceed approver seats. Seats
                    are 1–{MAX_BOARD_SIZE}.
                  </p>
                )}
                {state?.canChangeRules === false && (
                  <p className="text-xs text-gold">
                    A claim is in CIBA or waiting on the calendar write. Start over before
                    changing these.
                  </p>
                )}
                <Button
                  onClick={() => void saveRules()}
                  disabled={!rulesEnabled || rulesInvalid || !rulesDirty}
                >
                  {savingRules ? 'Saving…' : 'Save approver rules'}
                </Button>
              </CardContent>
            </Card>

            <Card className="hud-panel rounded-none border-transparent lg:col-span-2">
              <CardHeader className="pt-5">
                <CardTitle className="flex items-center gap-2 text-base uppercase">
                  <TriangleAlert className="h-4 w-4 text-gold" />
                  Clear room requests
                </CardTitle>
                <CardDescription>
                  Wipes every submitted request so the room can start fresh. Joiners stay
                  present; board rules and Google Calendar are untouched.
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                <Button
                  variant="destructive"
                  onClick={() => void clearRequests()}
                  disabled={clearingRequests}
                >
                  {clearingRequests ? 'Clearing…' : 'Clear room requests'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </details>

        <div className="animate-rise stagger-1">
          {!showcase && (
            <IntakeStage
              qrDataUrl={qrDataUrl}
              joinUrl={joinUrl}
              room={room}
              onPick={(sub) => void pickShowcase(sub)}
              picking={pickingShowcase}
            />
          )}

          {showcase && (showcase.status === 'pending' || showcase.status === 'awaiting_approval') && (
            <div className="mb-9">
              <ShowcaseHeader
                code={showcase.code}
                amount={showcase.requestedAmount ?? 0}
                reason={showcase.incidentDescription ?? ''}
                customerName={showcase.customerName ?? 'the customer'}
              />
            </div>
          )}

          {showcase && showcase.status === 'pending' && (
            <div className="space-y-9">
              <span className="inline-flex items-center rounded-lg border border-hud px-4.5 py-2.5 text-[18px] font-semibold text-hud">
                Claims Supervisor &middot; acting for{' '}
                {firstName(showcase.customerName ?? 'the customer')} &middot; Hero Shield
                authority
              </span>
              <StageList stages={showcase.stages} status={showcase.status} />
              <IdentityChain stages={showcase.stages} status={showcase.status} />
              <RequestQueueCompact otherCount={otherRequests} />
            </div>
          )}

          {showcase && showcase.status === 'awaiting_approval' && (
            <div className="space-y-9">
              <ExceptionPanel
                amount={showcase.requestedAmount ?? 0}
                approverName={approverName}
                board={showcase.board}
                stages={showcase.stages}
                status={showcase.status}
                showSendCiba={Boolean(showSendCiba)}
                sending={starting}
                sendDisabled={!fullBoard || !state?.googleConnected}
                failWhy={failWhy}
                onSendCiba={() => void startCiba()}
              />
              <RequestQueueCompact otherCount={otherRequests} />
            </div>
          )}

          {showcase && (showcase.status === 'approved' || showcase.status === 'denied') && (
            <div className="space-y-9">
              <OutcomePanel
                variant={showcase.status === 'approved' ? 'approved' : 'declined'}
                amount={showcase.requestedAmount ?? 0}
                code={showcase.code}
                authorizedBy={authorizedBy}
                calendarEventId={showcase.calendarEventId}
                googleConnected={Boolean(state?.googleConnected)}
              />
              <RequestQueueCompact otherCount={otherRequests} />
            </div>
          )}

          {claim && !showcase && (
            <p className="hud-label mt-6 text-center text-sm text-muted-foreground">
              A chat-filed claim ({claim.policyId}) is active on /file-claim. Start over to clear
              it before picking a showcase request.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
