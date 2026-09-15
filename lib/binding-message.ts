import { claimCode, type Claim } from '@/lib/types'

const BINDING_ALLOWED = /[^A-Za-z0-9+\-._.,:#]/g

/** Auth0 CIBA binding_message: max 64, charset A-Za-z0-9+-_.,:# , no spaces. */
export function sanitizeBindingInput(raw: string) {
  return raw.replace(/\s+/g, '-').replace(BINDING_ALLOWED, '').slice(0, 64)
}

export function sanitizeBindingMessage(raw: string) {
  return sanitizeBindingInput(raw).replace(/^-+|-+$/g, '') || 'Hulk-smash-claim'
}

/** Showcase claims carry the amount in the message; chat-filed claims fall back. */
export function bindingMessageForClaim(claim: Pick<Claim, 'id' | 'requestedAmount'>) {
  if (claim.requestedAmount != null) {
    return sanitizeBindingMessage(
      `HeroShield-approve-USD${Math.round(claim.requestedAmount)}-${claimCode(claim.id)}`,
    )
  }
  const short = claim.id.replace(/-/g, '').slice(0, 8)
  return sanitizeBindingMessage(`Hulk-smash-claim-${short}`)
}
