'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarCheck, Pin, PinOff, QrCode, Shuffle, SlidersHorizontal, TriangleAlert, UserRound } from 'lucide-react'
import { BoardPanel } from '@/components/board-panel'
import { ClearClaimButton } from '@/components/clear-claim-button'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  DEFAULT_BOARD_SIZE,
  DEFAULT_CIBA_YES_THRESHOLD,
  MAX_BOARD_SIZE,
  type CibaAutoStart,
  type CibaBoardSnapshot,
} from '@/lib/types'

type Joiner = {
  sub: string
  email: string
  name: string
  emailVerified: boolean
  pinned: boolean
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
  claim: {
    id: string
    status: string
    policyId: string
    incidentDescription: string | null
    calendarEventId: string | null
    board: CibaBoardSnapshot
  } | null
}

const POLL_MS = 2000

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
  const [picking, setPicking] = useState(false)
  const [starting, setStarting] = useState(false)
  const [savingRules, setSavingRules] = useState(false)
  const [savingHost, setSavingHost] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draftSize, setDraftSize] = useState(DEFAULT_BOARD_SIZE)
  const [draftThreshold, setDraftThreshold] = useState(DEFAULT_CIBA_YES_THRESHOLD)
  const [draftHostEmail, setDraftHostEmail] = useState(sessionEmail)
  const [draftHostSub, setDraftHostSub] = useState(sessionSub)
  const syncedRules = useRef<string | null>(null)
  const syncedHost = useRef<string | null>(null)

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

  const pick = async () => {
    setPicking(true)
    try {
      const res = await fetch('/api/board/pick', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Pick failed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pick failed')
    } finally {
      setPicking(false)
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

  const boardSize = state?.boardSize ?? DEFAULT_BOARD_SIZE
  const yesThreshold = state?.yesThreshold ?? DEFAULT_CIBA_YES_THRESHOLD
  const verified = state?.joiners.filter((j) => j.emailVerified) ?? []
  const unverified = state?.joiners.filter((j) => !j.emailVerified) ?? []
  const verifiedCount = state?.verifiedCount ?? verified.length
  const enoughVerified = verifiedCount >= boardSize
  const pickEnabled = Boolean(state?.canPick) && enoughVerified && !picking
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
  const blockReason = state?.claim?.board.blockReason
  const autoStart = state?.cibaAutoStart ?? null
  const members = state?.claim?.board.members ?? []
  const auth0StartFailed =
    (autoStart?.ok === true && autoStart.started === 0) ||
    Boolean(
      state?.claim?.board.started &&
        members.length > 0 &&
        members.every((m) => m.status === 'error'),
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
    Boolean(state?.claim?.board.started) &&
    members.some(
      (m) => m.status === 'pending' || m.status === 'approved' || m.status === 'denied',
    )
  const showSendCiba =
    state?.claim?.status === 'awaiting_approval' && autoStartFailed && !cibaAlreadyLive
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
        ? `Claim is waiting. Seated board is ${autoStart && !autoStart.ok ? autoStart.seated : members.length}, need exactly ${autoStart && !autoStart.ok ? autoStart.required : boardSize}. Pick a full non-host board.`
        : failReason === 'no_board' || blockReason === 'no_board'
          ? `Claim is waiting. Pick a board of ${boardSize}. CIBA starts automatically once a full non-host board is seated.`
          : failReason === 'auth0'
            ? `Auth0 did not accept the CIBA grant${
                members.find((m) => m.error)?.error
                  ? `: ${members.find((m) => m.error)?.error}`
                  : '.'
              }`
            : null

  return (
    <div className="hud-grid relative min-h-screen overflow-hidden p-4 md:p-8">
      <div className="relative mx-auto max-w-6xl">
        <div className="animate-rise mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="hud-label">Operator console · Admin</span>
            <h1 className="mt-2 font-display text-3xl font-bold uppercase tracking-tight md:text-4xl">
              CIBA board
            </h1>
            <p className="mt-2 max-w-xl text-muted-foreground">
              One QR for the room. Pick {boardSize}. File the Hulk claim.
              CIBA starts from this console automatically.{' '}
              {yesThreshold} email yes{yesThreshold === 1 ? '' : 'es'} release it
              and write your calendar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="hud" size="sm">
              <Link href="/settings">Google Calendar</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/file-claim">File a claim</Link>
            </Button>
            <ClearClaimButton onCleared={load} />
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
          <Card className="hud-panel animate-rise rounded-none border-transparent">
            <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary via-gold to-hud" />
            <CardHeader className="pt-5">
              <CardTitle className="flex items-center gap-2 text-base uppercase">
                <QrCode className="h-4 w-4 text-hud" />
                Room QR
              </CardTitle>
              <CardDescription>Everyone scans this, logs in, and waits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Join the claims board"
                className="mx-auto w-full max-w-[16rem] rounded-sm border border-hud/30"
              />
              <p className="hud-readout break-all text-center text-[0.65rem] text-muted-foreground">
                {joinUrl}
              </p>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {!state?.googleConnected && (
              <Card data-stone="mind" className="hud-panel rounded-none border-transparent">
                <span className="absolute inset-x-0 top-0 h-0.5 bg-[var(--stone)]" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base uppercase">
                    <TriangleAlert className="h-4 w-4 text-gold" />
                    Connect Google first
                  </CardTitle>
                  <CardDescription>
                    CIBA emails will not go out until the host Token Vault connection is live.
                    Otherwise a yes is hollow — there is nowhere to write the calendar event.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="gold">
                    <Link href="/settings">Connect Google Calendar</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card className="hud-panel animate-rise stagger-1 rounded-none border-transparent">
              <CardHeader className="pt-5">
                <CardTitle className="flex items-center gap-2 text-base uppercase">
                  <UserRound className="h-4 w-4 text-hud" />
                  Demo host
                </CardTitle>
                <CardDescription>
                  The presenter on stage — excluded from the CIBA board, and the
                  Google Calendar that receives the approved-claim event. Sub
                  defaults to your Auth0 <span className="font-mono">sub</span>.
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
                <p className="text-xs text-muted-foreground">
                  Console access is separate: any <span className="font-mono">@okta.com</span>{' '}
                  login or <span className="font-mono">admin@focusotter.com</span> can
                  operate this page. Only this identity is kept off the board.
                </p>
                {hostIncomplete && (
                  <p className="text-xs text-gold">
                    Save the presenter email or Auth0 sub before you pick a board.
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

            <Card className="hud-panel animate-rise stagger-1 rounded-none border-transparent">
              <CardHeader className="pt-5">
                <CardTitle className="flex items-center gap-2 text-base uppercase">
                  <SlidersHorizontal className="h-4 w-4 text-hud" />
                  Board rules
                </CardTitle>
                <CardDescription>
                  Default is {DEFAULT_BOARD_SIZE} seat
                  {DEFAULT_BOARD_SIZE === 1 ? '' : 's'} / {DEFAULT_CIBA_YES_THRESHOLD}{' '}
                  yes{DEFAULT_CIBA_YES_THRESHOLD === 1 ? '' : 'es'}. Raise to
                  6 / 3 on this card for the stage talk.
                </CardDescription>
              </CardHeader>
              <Separator />
              <CardContent className="space-y-4 pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1.5 text-sm">
                    <span className="hud-label text-[0.6rem]">Board size</span>
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
                    <span className="hud-label text-[0.6rem]">CIBA yes threshold</span>
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
                    Threshold must be at least 1 and cannot exceed board size. Size is 1–
                    {MAX_BOARD_SIZE}.
                  </p>
                )}
                {state?.canChangeRules === false && (
                  <p className="text-xs text-gold">
                    A claim is in CIBA or waiting on the calendar write. Start
                    over before changing board rules.
                  </p>
                )}
                <Button
                  onClick={() => void saveRules()}
                  disabled={!rulesEnabled || rulesInvalid || !rulesDirty}
                >
                  {savingRules ? 'Saving…' : 'Save board rules'}
                </Button>
              </CardContent>
            </Card>

            <Card className="hud-panel animate-rise stagger-1 rounded-none border-transparent">
              <CardHeader className="flex flex-row items-start justify-between gap-4 pt-5">
                <div>
                  <CardTitle className="text-base uppercase">Joiners</CardTitle>
                  <CardDescription>
                    {verifiedCount}/{boardSize} verified · select planted friends, then pick
                  </CardDescription>
                </div>
                <Button onClick={() => void pick()} disabled={!pickEnabled}>
                  <Shuffle className="h-4 w-4" />
                  {picking ? 'Picking…' : 'Pick board'}
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
                    Need {boardSize} verified joiners before you can pick. A short
                    board can never hit {yesThreshold} CIBA yes
                    {yesThreshold === 1 ? '' : 'es'}.
                  </p>
                )}
                {state?.canPick === false && (
                  <p className="text-xs text-gold">
                    CIBA emails are already out. Start over before picking again.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card
              data-stone={state?.claim?.status === 'approved' ? 'time' : 'space'}
              className="hud-panel animate-rise stagger-2 rounded-none border-transparent"
            >
              <CardHeader className="pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base uppercase">Projector board</CardTitle>
                    <CardDescription>
                      {state?.claim
                        ? `${state.claim.policyId} · ${state.claim.status}`
                        : 'No claim submitted yet'}
                    </CardDescription>
                  </div>
                  {state?.claim?.calendarEventId && (
                    <Badge variant="success">
                      <CalendarCheck className="h-3 w-3" />
                      Calendar written
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="space-y-4 pt-5">
                {showSendCiba && failWhy && (
                  <p className="text-sm text-gold">{failWhy}</p>
                )}
                {showSendCiba && (
                  <Button
                    variant="outline"
                    onClick={() => void startCiba()}
                    disabled={starting || !fullBoard || !state?.googleConnected}
                  >
                    {starting ? 'Sending…' : 'Send CIBA emails'}
                  </Button>
                )}
                {state?.claim ? (
                  <BoardPanel board={state.claim.board} />
                ) : state?.board.length ? (
                  <BoardPanel
                    board={{
                      members: state.board.map((m) => ({
                        ...m,
                        status: 'pending',
                      })),
                      approvedCount: 0,
                      requiredApprovals: yesThreshold,
                      boardSize: state.boardSize,
                      blockReason: null,
                      calendarEventId: null,
                      started: false,
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Pick a board to seat {boardSize} names.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
