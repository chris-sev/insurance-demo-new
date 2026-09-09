import { NextResponse } from 'next/server'
import { requireHostSession } from '@/lib/api-auth'
import { getDemoHost, saveDemoHost } from '@/lib/board-config'
import { normalizeDemoHostEmail, normalizeDemoHostSub } from '@/lib/host'

export async function GET() {
  const auth = await requireHostSession()
  if ('error' in auth) return auth.error
  return NextResponse.json(await getDemoHost())
}

export async function POST(request: Request) {
  const auth = await requireHostSession()
  if ('error' in auth) return auth.error

  let body: { email?: unknown; sub?: unknown }
  try {
    body = (await request.json()) as { email?: unknown; sub?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  try {
    const email = normalizeDemoHostEmail(body.email)
    const sub = normalizeDemoHostSub(body.sub)
    if (!email && !sub) {
      return NextResponse.json(
        { error: 'Save an email or an Auth0 sub so the presenter is excluded from the board.' },
        { status: 400 },
      )
    }
    const host = await saveDemoHost({
      email,
      sub,
      updatedBy: auth.session.user.sub,
    })
    return NextResponse.json(host)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Save failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
