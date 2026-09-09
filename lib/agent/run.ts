import { generateText, stepCountIs } from 'ai'
import { claimsModel } from '@/lib/agent/model'
import { SYSTEM_PROMPT, claimContext } from '@/lib/agent/system-prompt'
import { claimTools } from '@/lib/agent/tools'
import { getClaim } from '@/lib/claims'
import type { ChatMessage, Claim } from '@/lib/types'

const MAX_OUTPUT_TOKENS = 8000
const MAX_TURNS = 6

/**
 * One agent turn. Replaces the Strands Agent + Bedrock nova-lite Lambda,
 * then the direct Anthropic SDK loop. Routes through the Vercel AI Gateway
 * with an Anthropic default (`anthropic/claude-opus-5`).
 *
 * prepareStep re-reads the claim after each tool write so the next
 * instructions match Neon, not a stale in-memory snapshot.
 */
export async function runAgent(
  claim: Claim,
  history: ChatMessage[],
): Promise<{ reply: string; claim: Claim }> {
  const firstUser = history.findIndex((m) => m.role === 'user')
  const trimmed = firstUser >= 0 ? history.slice(firstUser) : []
  const claimId = claim.id
  let current = claim

  const result = await generateText({
    model: claimsModel(),
    instructions: SYSTEM_PROMPT + '\n\n' + claimContext(current),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    stopWhen: stepCountIs(MAX_TURNS),
    tools: claimTools(current),
    messages: trimmed.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    prepareStep: async () => {
      current = (await getClaim(claimId)) ?? current
      return {
        instructions: SYSTEM_PROMPT + '\n\n' + claimContext(current),
      }
    },
    providerOptions: {
      gateway: {
        tags: ['feature:claims-agent', 'app:hero-shield'],
      },
    },
  })

  current = (await getClaim(claimId)) ?? current
  const reply = result.text.trim()

  return {
    reply: reply || 'I apologize, but I could not generate a response.',
    claim: current,
  }
}
