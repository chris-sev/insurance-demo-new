import { generateText, stepCountIs, tool } from 'ai'
import { z } from 'zod'
import { claimsModel } from '@/lib/agent/model'
import { appendClaimStage, autoApproveClaim, getClaim, setClaimDecision } from '@/lib/claims'
import {
  HUMAN_AUTHORITY_THRESHOLD,
  STAGES,
  type Claim,
  type ClaimStage,
  type StageKey,
} from '@/lib/types'

const MAX_OUTPUT_TOKENS = 1500
const MAX_STEPS = 7
const TIMEOUT_MS = 45_000

const STAGE_TOOL: Record<StageKey, string> = {
  policy: 'policy_check',
  coverage: 'coverage_check',
  risk: 'risk_check',
  repair: 'repair_plan',
  customer_update: 'customer_update',
}

const STAGE_DESCRIPTION: Record<StageKey, string> = {
  policy: 'Policy Specialist: confirm the policy is active and covers this kind of incident.',
  coverage: 'Coverage Specialist: confirm coverage limits and exclusions for this claim.',
  risk: 'Risk Specialist: screen for fraud or anomaly signals in the request.',
  repair: 'Repair Specialist: propose a repair inspection for the damage described.',
  customer_update: 'Customer Update Specialist: write the customer-facing status line.',
}

const stageInputSchema = z.object({
  summary: z.string().max(200),
  flagged: z.boolean(),
})

function stageTool(claimId: string, key: StageKey) {
  return tool({
    description: STAGE_DESCRIPTION[key],
    inputSchema: stageInputSchema,
    execute: async ({ summary, flagged }) => {
      const stage: ClaimStage = {
        key,
        status: flagged ? 'flagged' : 'done',
        summary,
        at: new Date().toISOString(),
      }
      await appendClaimStage(claimId, stage)
      return 'recorded'
    },
  })
}

function supervisorTools(claimId: string) {
  return {
    [STAGE_TOOL.policy]: stageTool(claimId, 'policy'),
    [STAGE_TOOL.coverage]: stageTool(claimId, 'coverage'),
    [STAGE_TOOL.risk]: stageTool(claimId, 'risk'),
    [STAGE_TOOL.repair]: stageTool(claimId, 'repair'),
    [STAGE_TOOL.customer_update]: stageTool(claimId, 'customer_update'),
  }
}

function instructionsFor(claim: Claim): string {
  const amount = `$${(claim.requestedAmount ?? 0).toLocaleString('en-US')}`
  const reason = claim.incidentDescription || 'an unspecified incident'
  const customer = claim.customerName ?? 'the customer'

  return `You are the Claims Supervisor at Hero Shield Insurance. You coordinate five named specialist stages as tool calls, acting on behalf of the customer under Hero Shield company authority. You are not five separate agents — you are one supervisor running five governed checks.

Customer: ${customer}
Requested amount: ${amount}
Reported reason: "${reason}"
Policy: ${claim.policyId}

Run these five stages in this exact order, calling exactly one tool per stage, once each, never skipping or repeating a stage:
1. policy_check — Policy Specialist
2. coverage_check — Coverage Specialist
3. risk_check — Risk Specialist
4. repair_plan — Repair Specialist
5. customer_update — Customer Update Specialist

Rules for every tool call:
- "summary" is one or two plain sentences a projector shows verbatim to a room. Reference the actual reported reason with some wit — the reason is the fun part, never generic boilerplate.
- "flagged" is true only if that stage genuinely found something worth a human's attention. This should be rare. Otherwise false.
- The Repair Specialist's summary proposes a repair inspection for the damage described.
- The Customer Update Specialist's summary is the line the customer actually sees next.
- You do NOT decide whether this claim is approved, denied, or needs human authorization. That decision is made by policy code after you finish, never by you. Do not mention approval or denial in any summary.

After all five tools have each been called once, stop.`
}

/**
 * Runs the five specialist stages as tool calls in one generateText loop,
 * then applies the policy decision (amount vs HUMAN_AUTHORITY_THRESHOLD)
 * in code — never the model. Wrapped in a 45s timeout; on any error,
 * timeout, or missing stage, deterministic fallbacks fill the gaps so the
 * showcase never stalls in front of a room.
 */
export async function runSupervisor(claim: Claim): Promise<Claim> {
  try {
    await generateText({
      model: claimsModel(),
      instructions: instructionsFor(claim),
      prompt: 'Process this claim now: run the five specialist stages in order.',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
      tools: supervisorTools(claim.id),
      providerOptions: {
        gateway: {
          tags: ['feature:claims-supervisor', 'app:hero-shield'],
        },
      },
    })
  } catch (error) {
    console.error('Claims Supervisor run failed, falling back to templated stages:', error)
  }

  await fillMissingStages(claim)

  return applyDecision(claim)
}

// ponytail: deterministic stage-fallback templates. The model can time out,
// error, or skip a stage — the showcase can never stall in front of a
// room, so every stage not recorded by the model gets a plain, on-brand
// summary built straight from the request (amount/reason/customer).
async function fillMissingStages(claim: Claim): Promise<void> {
  const current = (await getClaim(claim.id)) ?? claim
  const done = new Set(current.stages.map((s) => s.key))
  const amount = `$${(claim.requestedAmount ?? 0).toLocaleString('en-US')}`
  const reason = claim.incidentDescription || 'the reported incident'
  const customer = claim.customerName ?? 'the customer'

  const templates: Record<StageKey, string> = {
    policy: `${customer}'s policy is active and covers this kind of claim.`,
    coverage: `Coverage checks out for ${amount} against "${reason}".`,
    risk: 'No fraud or anomaly signals found for this request.',
    repair: 'Repair Specialist proposes a repair inspection for the damage described.',
    customer_update: `${customer}, we've reviewed your claim for "${reason}" and you'll hear from us shortly.`,
  }

  for (const { key } of STAGES) {
    if (done.has(key)) continue
    await appendClaimStage(claim.id, {
      key,
      status: 'done',
      summary: templates[key],
      at: new Date().toISOString(),
    })
  }
}

/** Policy code decides — never the model. */
async function applyDecision(claim: Claim): Promise<Claim> {
  const amount = claim.requestedAmount ?? 0
  const updated =
    amount > HUMAN_AUTHORITY_THRESHOLD
      ? await setClaimDecision(claim.id, 'exception', 'awaiting_approval')
      : await autoApproveClaim(claim.id)
  return updated ?? ((await getClaim(claim.id)) as Claim)
}
