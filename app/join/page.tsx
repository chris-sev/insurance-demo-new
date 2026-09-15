import { auth0 } from '@/lib/auth0'
import { AudienceNav } from '@/components/site-nav'
import { JoinClient, JoinLogin } from '@/components/join-client'

export const metadata = {
  title: 'Join the board — Hero Shield Insurance',
}

export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const session = await auth0.getSession()
  const params = await searchParams
  const error = typeof params.error === 'string' ? params.error : null

  return (
    <>
      <AudienceNav />
      {session ? (
        <JoinClient
          userEmail={typeof session.user.email === 'string' ? session.user.email : ''}
          authError={error}
        />
      ) : (
        <JoinLogin authError={error} />
      )}
    </>
  )
}
