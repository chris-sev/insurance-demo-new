export type SessionUser = {
  sub?: string
  email?: string | null
}

export type DemoHost = {
  email: string | null
  sub: string | null
}

const FOCUS_ADMIN_EMAIL = 'admin@focusotter.com'

/** Optional env seed. Live values are saved on /host into demo_settings. */
export function envHostSub(): string | null {
  return process.env.DEMO_HOST_SUB?.trim() || null
}

export function envHostEmail(): string | null {
  return process.env.DEMO_HOST_EMAIL?.trim().toLowerCase() || null
}

/**
 * Console access — not board exclusion. Any @okta.com login or
 * admin@focusotter.com can operate /host. Audience at an Okta talk
 * can still sit on the CIBA board unless they match the configured
 * demo host.
 */
export function isAdminEmail(email?: string | null): boolean {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return false
  if (normalized === FOCUS_ADMIN_EMAIL) return true
  return normalized.endsWith('@okta.com')
}

export function isAdmin(user: SessionUser): boolean {
  return isAdminEmail(user.email)
}

/** @deprecated Use isAdmin. Kept so existing imports keep compiling during the split. */
export function isDemoHost(user: SessionUser): boolean {
  return isAdmin(user)
}

export function matchesDemoHost(
  host: DemoHost,
  sub: string,
  email?: string | null,
): boolean {
  const hostEmail = host.email?.trim().toLowerCase() || null
  const hostSub = host.sub?.trim() || null
  if (hostEmail && email?.trim().toLowerCase() === hostEmail) return true
  if (hostSub && sub === hostSub) return true
  return false
}

export function hostIdentityConfigured(host: DemoHost): boolean {
  return Boolean(host.email?.trim() || host.sub?.trim())
}

/**
 * Token Vault tokens belong to the current session. Only write calendar
 * when that session is the configured demo host — prefer sub so we
 * never mint an event from a joiner who happened to be polling.
 */
export function canWriteHostCalendar(user: SessionUser, host: DemoHost): boolean {
  if (!isAdmin(user) && !matchesDemoHost(host, user.sub ?? '', user.email)) {
    return false
  }
  const configuredSub = host.sub?.trim()
  if (configuredSub) return user.sub === configuredSub
  const configuredEmail = host.email?.trim().toLowerCase()
  if (configuredEmail) return user.email?.trim().toLowerCase() === configuredEmail
  return isAdmin(user)
}

export function normalizeDemoHostEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  if (!email) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Demo host email must look like a real email address.')
  }
  return email
}

export function normalizeDemoHostSub(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const sub = value.trim()
  return sub || null
}
