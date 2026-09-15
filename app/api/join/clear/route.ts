import { NextResponse } from 'next/server'
import { requireHostSession } from '@/lib/api-auth'
import { clearJoinerRequests } from '@/lib/board'

/** Pre-show settings "Clear room requests" — nulls every audience request. */
export async function POST() {
  const auth = await requireHostSession()
  if ('error' in auth) return auth.error

  const cleared = await clearJoinerRequests()
  return NextResponse.json({ cleared })
}
