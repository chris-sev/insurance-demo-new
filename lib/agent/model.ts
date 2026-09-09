/** Default claims model — Anthropic via the Vercel AI Gateway. */
export const DEFAULT_CLAIMS_MODEL = 'anthropic/claude-opus-5'

export function claimsModel(): string {
  return process.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_CLAIMS_MODEL
}
