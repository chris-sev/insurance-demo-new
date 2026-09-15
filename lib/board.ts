import { getBoardSettings, getDemoHost } from '@/lib/board-config'
import { sql } from '@/lib/db'
import { matchesDemoHost, type DemoHost } from '@/lib/host'
import type { RoomRequest, RoomStats } from '@/lib/types'

export type Joiner = {
  sub: string
  email: string
  name: string
  emailVerified: boolean
  pinned: boolean
  joinedAt: string
  lastSeenAt: string
  requestedAmount: number | null
  incidentReason: string | null
  requestedAt: string | null
}

export type BoardMember = {
  sub: string
  email: string
  name: string
}

type JoinerRow = {
  sub: string
  email: string
  name: string
  email_verified: boolean
  pinned: boolean
  joined_at: Date | string
  last_seen_at: Date | string
  requested_amount: string | number | null
  incident_reason: string | null
  requested_at: Date | string | null
}

function toJoiner(row: JoinerRow): Joiner {
  return {
    sub: row.sub,
    email: row.email,
    name: row.name,
    emailVerified: row.email_verified,
    pinned: row.pinned,
    joinedAt: new Date(row.joined_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    requestedAmount: row.requested_amount == null ? null : Number(row.requested_amount),
    incidentReason: row.incident_reason,
    requestedAt: row.requested_at == null ? null : new Date(row.requested_at).toISOString(),
  }
}

export async function upsertJoiner(input: {
  sub: string
  email: string
  name: string
  emailVerified: boolean
}): Promise<Joiner> {
  const rows = (await sql`
    insert into demo_joiners (sub, email, name, email_verified, last_seen_at)
    values (${input.sub}, ${input.email}, ${input.name}, ${input.emailVerified}, now())
    on conflict (sub) do update set
      email = excluded.email,
      name = excluded.name,
      email_verified = excluded.email_verified,
      last_seen_at = now()
    returning *
  `) as JoinerRow[]
  return toJoiner(rows[0])
}

export async function listJoiners(): Promise<Joiner[]> {
  const rows = (await sql`
    select * from demo_joiners
    order by pinned desc, joined_at
  `) as JoinerRow[]
  return rows.map(toJoiner)
}

export async function getJoiner(sub: string): Promise<Joiner | null> {
  const rows = (await sql`
    select * from demo_joiners where sub = ${sub}
  `) as JoinerRow[]
  return rows[0] ? toJoiner(rows[0]) : null
}

export async function setJoinerPinned(sub: string, pinned: boolean): Promise<Joiner | null> {
  const rows = (await sql`
    update demo_joiners set pinned = ${pinned}
    where sub = ${sub}
    returning *
  `) as JoinerRow[]
  return rows[0] ? toJoiner(rows[0]) : null
}

/** Backs POST /api/join with a body — the audience's showcase request. */
export async function saveJoinerRequest(
  sub: string,
  amount: number,
  reason: string,
): Promise<Joiner | null> {
  const rows = (await sql`
    update demo_joiners
    set requested_amount = ${amount}, incident_reason = ${reason}, requested_at = now()
    where sub = ${sub}
    returning *
  `) as JoinerRow[]
  return rows[0] ? toJoiner(rows[0]) : null
}

/** POST /api/join/clear — wipes every audience request. Joiners themselves stay. */
export async function clearJoinerRequests(): Promise<number> {
  const rows = (await sql`
    update demo_joiners
    set requested_amount = null, incident_reason = null, requested_at = null
    where requested_amount is not null
    returning sub
  `) as { sub: string }[]
  return rows.length
}

/** Largest amount first, tie broken by earliest requested_at. Shared so the
 *  /host queue and the showcase pick agree on "biggest request". */
function byAmountThenEarliest(a: Joiner, b: Joiner): number {
  const diff = (b.requestedAmount ?? 0) - (a.requestedAmount ?? 0)
  if (diff !== 0) return diff
  return (a.requestedAt ?? '').localeCompare(b.requestedAt ?? '')
}

export async function roomStats(
  joiners: Joiner[],
  selectedSub?: string | null,
): Promise<RoomStats> {
  const host = await getDemoHost()
  const inRoom = withoutHost(joiners, host)
  const withRequests = inRoom.filter((j) => j.requestedAmount != null)
  const queue: RoomRequest[] = [...withRequests]
    .sort(byAmountThenEarliest)
    .slice(0, 8)
    .map((j) => ({
      sub: j.sub,
      name: j.name,
      amount: j.requestedAmount as number,
      reason: j.incidentReason ?? '',
      requestedAt: j.requestedAt as string,
      selected: j.sub === selectedSub,
    }))
  return {
    joined: inRoom.length,
    requests: withRequests.length,
    totalRequested: withRequests.reduce((sum, j) => sum + (j.requestedAmount ?? 0), 0),
    queue,
  }
}

/**
 * Deterministic showcase pick: largest amount, tie earliest requested_at.
 * Pass `sub` to force a specific request (the "Pick this" row button).
 */
export function pickShowcaseRequest(joiners: Joiner[], sub?: string | null): Joiner | null {
  const withRequests = joiners.filter((j) => j.requestedAmount != null)
  if (sub) return withRequests.find((j) => j.sub === sub) ?? null
  if (withRequests.length === 0) return null
  return [...withRequests].sort(byAmountThenEarliest)[0]
}

export async function getLatestPickId(): Promise<string | null> {
  const rows = (await sql`
    select id from board_picks
    order by picked_at desc
    limit 1
  `) as { id: string }[]
  return rows[0]?.id ?? null
}

export function withoutHost<T extends { sub: string; email?: string | null }>(
  members: T[],
  host: DemoHost,
): T[] {
  return members.filter((m) => !matchesDemoHost(host, m.sub, m.email))
}

/** Drop leftover operator seats from a pick. Host files the claim; they never CIBA it. */
async function dropHostSeats(pickId: string, host: DemoHost): Promise<void> {
  if (host.sub) {
    await sql`delete from board_members where pick_id = ${pickId} and sub = ${host.sub}`
  }
  if (host.email) {
    await sql`
      delete from board_members
      where pick_id = ${pickId} and lower(email) = ${host.email}
    `
  }
}

export async function getCurrentBoard(): Promise<BoardMember[]> {
  const pickId = await getLatestPickId()
  if (!pickId) return []
  const host = await getDemoHost()
  await dropHostSeats(pickId, host)
  const rows = (await sql`
    select sub, email, name from board_members
    where pick_id = ${pickId}
    order by name
  `) as BoardMember[]
  return withoutHost(rows, host)
}

export async function isOnCurrentBoard(
  sub: string,
  email?: string | null,
): Promise<boolean> {
  const host = await getDemoHost()
  if (matchesDemoHost(host, sub, email)) return false
  const board = await getCurrentBoard()
  if (board.some((m) => m.sub === sub)) return true
  const needle = email?.trim().toLowerCase()
  if (needle && board.some((m) => m.email.toLowerCase() === needle)) return true
  return false
}

/** Wipe the seated pick. Joiners, demo_settings, and Token Vault stay. */
export async function clearSeatedBoard(): Promise<void> {
  await sql`delete from board_picks`
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Verified, non-host joiners — the only people who can sit on the CIBA board. */
export function eligibleJoiners(joiners: Joiner[], host: DemoHost): Joiner[] {
  return joiners.filter((j) => j.emailVerified && !matchesDemoHost(host, j.sub, j.email))
}

/**
 * Randomly select the saved board size of verified joiners (default 1).
 * Pinned rows (planted friends) are always included first; the rest
 * of the seats are shuffled in. The host is never seated — they file
 * the claim, they don't CIBA it.
 */
export function selectBoard(joiners: Joiner[], size: number, host: DemoHost): Joiner[] {
  const eligible = eligibleJoiners(joiners, host)
  const pinned = eligible.filter((j) => j.pinned)
  const rest = shuffle(eligible.filter((j) => !j.pinned))
  return [...pinned, ...rest].slice(0, size)
}

export async function pickBoard(pickedBy: string): Promise<BoardMember[]> {
  const [{ boardSize: size }, joiners, host] = await Promise.all([
    getBoardSettings(),
    listJoiners(),
    getDemoHost(),
  ])
  const eligible = eligibleJoiners(joiners, host)
  if (eligible.length < size) {
    throw new Error(
      `Need ${size} verified joiners to pick a board. Currently ${eligible.length}.`,
    )
  }
  const selected = withoutHost(selectBoard(joiners, size, host), host)
  if (selected.length !== size || selected.some((m) => matchesDemoHost(host, m.sub, m.email))) {
    throw new Error(
      `Need ${size} verified joiners to pick a board. Currently ${selected.length}. The operator cannot sit.`,
    )
  }

  const pickRows = (await sql`
    insert into board_picks (picked_by)
    values (${pickedBy})
    returning id
  `) as { id: string }[]
  const pickId = pickRows[0].id

  for (const member of selected) {
    await sql`
      insert into board_members (pick_id, sub, email, name)
      values (${pickId}, ${member.sub}, ${member.email}, ${member.name})
    `
  }

  // Replace leftover picks (including a leftover host-only seat) so Pick
  // is never a no-op when CIBA is not yet live.
  await sql`delete from board_picks where id <> ${pickId}`

  return selected.map(({ sub, email, name }) => ({ sub, email, name }))
}
