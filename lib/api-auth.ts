import { NextResponse } from 'next/server'
import { auth0 } from '@/lib/auth0'
import { isAdmin } from '@/lib/host'

export async function requireSession() {
  const session = await auth0.getSession()
  if (!session) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { session }
}

export async function requireHostSession() {
  const result = await requireSession()
  if ('error' in result) return result
  if (!isAdmin(result.session.user)) {
    return {
      error: NextResponse.json(
        { error: 'Only an admin can do that.' },
        { status: 403 },
      ),
    }
  }
  return result
}
