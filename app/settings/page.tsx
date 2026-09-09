import { redirect } from 'next/navigation'
import { auth0 } from '@/lib/auth0'
import { getBoardSettings } from '@/lib/board-config'
import { isGoogleConnected } from '@/lib/google'
import { isAdmin } from '@/lib/host'
import { SiteNav } from '@/components/site-nav'
import { SettingsClient } from '@/components/settings-client'

export const metadata = {
  title: 'Host settings — Hero Shield Insurance',
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const session = await auth0.getSession()
  if (!session) redirect('/auth/login?returnTo=/settings')
  if (!isAdmin(session.user)) redirect('/join')

  const params = await searchParams
  const error = typeof params.error === 'string' ? params.error : null
  const settings = await getBoardSettings()

  return (
    <>
      <SiteNav />
      <SettingsClient
        userName={session.user.name ?? 'Host'}
        userEmail={typeof session.user.email === 'string' ? session.user.email : ''}
        googleConnected={await isGoogleConnected()}
        connectError={error}
        boardSize={settings.boardSize}
        yesThreshold={settings.yesThreshold}
      />
    </>
  )
}
