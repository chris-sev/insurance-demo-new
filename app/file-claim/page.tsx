import { redirect } from 'next/navigation'
import { auth0 } from '@/lib/auth0'
import { isAdmin } from '@/lib/host'
import { SiteNav } from '@/components/site-nav'
import { FileClaimClient } from '@/components/file-claim-client'

export default async function FileClaimPage() {
  // proxy.ts already guards this route; this is the server-side belt-and-braces.
  const session = await auth0.getSession()
  if (!session) redirect('/auth/login?returnTo=/file-claim')

  return (
    <>
      <SiteNav />
      <FileClaimClient
        userLabel={session.user.name ?? session.user.email ?? 'there'}
        isHost={isAdmin(session.user)}
      />
    </>
  )
}
