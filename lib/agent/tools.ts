import { tool } from 'ai'
import { z } from 'zod'
import { cibaStartAgentMessage, startCibaForSubmittedClaim } from '@/lib/ciba-flow'
import { flagFraud, saveClaimDetails, submitClaim } from '@/lib/claims'
import { MOCK_VEHICLE_DATA } from '@/lib/agent/system-prompt'
import type { Claim } from '@/lib/types'

/**
 * AI SDK tools for one claim. Each execute writes Neon, then the agent
 * loop re-reads the row so the next system prompt matches the database.
 */
export function claimTools(claim: Claim) {
  return {
    save_claim_details: tool({
      description:
        'Save the claim details once you have collected all necessary information: incident description, location, and damage extent. Only call this when you have all three pieces of information.',
      inputSchema: z.object({
        incidentDescription: z
          .string()
          .describe(
            'A detailed description of what happened (e.g. "The Hulk threw my car across the street")',
          ),
        incidentLocation: z
          .string()
          .describe('Where the incident occurred (e.g. "Downtown parking lot on 5th Avenue")'),
        damageExtent: z
          .string()
          .describe(
            'The severity of damage to the vehicle (e.g. "Totaled", "Minor dents", "Windshield cracked")',
          ),
      }),
      execute: async ({ incidentDescription, incidentLocation, damageExtent }) => {
        await saveClaimDetails(claim.id, {
          incidentDescription,
          incidentLocation,
          damageExtent,
        })

        return `Claim details saved successfully. Present the following summary to the user and ask if they want to submit:

CLAIM SUMMARY:
- Vehicle: ${MOCK_VEHICLE_DATA.year} ${MOCK_VEHICLE_DATA.color} ${MOCK_VEHICLE_DATA.make} ${MOCK_VEHICLE_DATA.model}
- Incident: ${incidentDescription}
- Location: ${incidentLocation}
- Damage: ${damageExtent}
- Policy Number: ${claim.policyId}

Ask the user if they are ready to submit this claim for processing.`
      },
    }),

    notify_fraud: tool({
      description: 'Notify the fraud department of a potential fraudulent claim.',
      inputSchema: z.object({
        fraudType: z.string().describe('The type of suspected fraud'),
        fraudDescription: z.string().describe('Why this claim looks fraudulent'),
      }),
      execute: async ({ fraudType, fraudDescription }) => {
        await flagFraud(claim.id, `${fraudType}: ${fraudDescription}`)
        return 'Fraud department notified successfully.'
      },
    }),

    publish_claim_submission: tool({
      description:
        'Submit the claim after the user explicitly confirms they want it sent. Flips the claim to awaiting_approval. Starts CIBA only from the host session (same grant as POST /api/ciba). A non-host filer gets not_host — the operator console on /host starts CIBA automatically. The tool result says whether mail went out, that the console is starting it, or why it is blocked. Tell the user that. If not_host, say the board is being emailed / it is starting. Do not tell a non-host to click Send CIBA. Do not claim the board was emailed unless the result says CIBA started, is already live, or not_host (console will start it).',
      inputSchema: z.object({
        confirmSubmission: z
          .boolean()
          .describe('Whether the user confirmed they want to submit the claim'),
      }),
      execute: async ({ confirmSubmission }) => {
        if (confirmSubmission !== true) {
          return 'Claim submission cancelled. Ask the user if they would like to make any changes before submitting.'
        }
        await submitClaim(claim.id)
        const ciba = await startCibaForSubmittedClaim(claim.id)
        return cibaStartAgentMessage(ciba)
      },
    }),
  }
}
