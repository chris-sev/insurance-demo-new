import QRCode from 'qrcode'

export async function joinQrDataUrl(joinUrl: string): Promise<string> {
  return QRCode.toDataURL(joinUrl, {
    width: 360,
    margin: 1,
    color: {
      dark: '#071018',
      light: '#e8f6ff',
    },
    errorCorrectionLevel: 'M',
  })
}

export function joinUrlFromBase(baseUrl: string): string {
  return new URL('/join', baseUrl.replace(/\/$/, '') + '/').toString()
}

/**
 * Public origin for the room QR. Prefer the request host (so :3002,
 * preview URLs, and custom domains all match) and only fall back to
 * APP_BASE_URL if Host is missing.
 */
export function originFromHeaders(headerStore: Headers): string {
  const forwardedHost = headerStore.get('x-forwarded-host')
  const host =
    forwardedHost?.split(',')[0]?.trim() || headerStore.get('host')?.trim() || ''
  if (!host) {
    return (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  }
  const forwardedProto = headerStore.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const proto =
    forwardedProto ||
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
  return `${proto}://${host}`
}

export function joinUrlFromHeaders(headerStore: Headers): string {
  return joinUrlFromBase(originFromHeaders(headerStore))
}
