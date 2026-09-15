'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@auth0/nextjs-auth0'
import { FileText, LogIn, LogOut, Settings, ShieldHalf, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/join', label: 'Join the room' },
  { href: '/host', label: 'Control room' },
]

export function SiteNav() {
  const { user, isLoading } = useUser()
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-12">
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative grid h-9 w-9 place-items-center">
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-transparent ring-1 ring-primary/40 transition-all duration-300 group-hover:ring-hud/70" />
            <ShieldHalf className="relative h-5 w-5 text-primary transition-colors duration-300 group-hover:text-hud" />
          </span>
          <span className="font-display text-[19px] font-bold uppercase leading-6 tracking-[0.01em] text-foreground">
            Hero Shield
          </span>
        </Link>

        <div className="hidden items-center gap-10 md:flex">
          {LINKS.map(({ href, label }) => {
            const active = href === '/' ? pathname === '/' : pathname?.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'font-sans text-[16px] font-semibold leading-5 transition-colors',
                  active ? 'text-primary' : 'text-foreground hover:text-primary/80',
                )}
              >
                {label}
              </Link>
            )
          })}
        </div>

        <div className="flex items-center gap-3.5">
          {isLoading ? (
            <div className="h-9 w-24 animate-pulse rounded-md bg-muted/60" />
          ) : user ? (
            <>
              <div className="hidden items-center gap-1 sm:flex">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground normal-case tracking-normal"
                >
                  <Link href="/file-claim">
                    <FileText className="h-4 w-4" />
                    <span className="hidden lg:inline">File a Claim</span>
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground normal-case tracking-normal"
                >
                  <Link href="/settings" aria-label="Host settings">
                    <Settings className="h-4 w-4" />
                  </Link>
                </Button>
                <Link href="/profile" className="ml-1 shrink-0" aria-label="Your profile">
                  <Avatar className="h-8 w-8 ring-1 ring-border transition-all hover:ring-hud">
                    <AvatarImage src={user.picture ?? undefined} alt={user.name ?? 'User'} />
                    <AvatarFallback className="bg-secondary">
                      <User className="h-4 w-4 text-hud" />
                    </AvatarFallback>
                  </Avatar>
                </Link>
              </div>
              <span className="hidden font-mono text-[13px] uppercase tracking-[0.06em] text-muted-foreground sm:inline">
                {user.email}
              </span>
              <Button asChild className="h-10 rounded-lg px-5 text-sm normal-case tracking-normal">
                <a href="/auth/logout" aria-label="Log out">
                  Log out
                </a>
              </Button>
            </>
          ) : (
            <Button asChild className="h-10 rounded-lg px-5 text-sm normal-case tracking-normal">
              <a href="/auth/login">
                <LogIn className="h-4 w-4" />
                Sign in
              </a>
            </Button>
          )}
        </div>
      </div>
    </nav>
  )
}

/**
 * Audience phones on /join. Logo + logout only — File a Claim and Settings
 * wander the room off the QR path.
 */
export function AudienceNav() {
  const { user, isLoading } = useUser()

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Link href="/join" className="flex items-center gap-2.5">
          <span className="relative grid h-8 w-8 place-items-center">
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/30 to-transparent ring-1 ring-primary/40" />
            <ShieldHalf className="relative h-4 w-4 text-primary" />
          </span>
          <span className="font-display text-[15px] font-bold uppercase leading-5 tracking-[0.01em] text-foreground">
            Hero Shield
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="h-8 w-16 animate-pulse rounded-md bg-muted/60" />
          ) : user ? (
            <Button asChild variant="ghost" size="sm" className="normal-case tracking-normal">
              <a href="/auth/logout" aria-label="Log out">
                <LogOut className="h-4 w-4 sm:mr-1.5" />
                <span className="hidden sm:inline">Log out</span>
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </nav>
  )
}

/**
 * Hero / closing CTA pair. Same destinations whether or not the visitor is
 * logged in — Universal Login happens on the way into /host or /join, not
 * before it.
 */
export function HeroActions() {
  const { isLoading } = useUser()

  // Reserve the row's height so the hero doesn't jump when the session lands.
  if (isLoading) return <div className="h-14" />

  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button
        asChild
        variant="gold"
        className="h-14 rounded-lg px-7 text-[17px] font-bold normal-case tracking-normal"
      >
        <Link href="/host">Open the control room</Link>
      </Button>
      <Button
        asChild
        variant="hud"
        className="h-14 rounded-lg px-7 text-[17px] font-bold normal-case tracking-normal"
      >
        <Link href="/join">Join the room</Link>
      </Button>
    </div>
  )
}
