import { CalendarCheck } from 'lucide-react'
import { formatMoney } from '@/components/stage/format'

const CLOSING_LINE =
  'Every agent has a principal. Every delegation is scoped. Real authority crosses a human boundary.'

/** The claim is resolved: approved (with the calendar write) or declined. */
export function OutcomePanel({
  variant,
  amount,
  code,
  authorizedBy,
  calendarEventId,
  googleConnected,
}: {
  variant: 'approved' | 'declined'
  amount: number
  code: string
  /** Approver name for a human decision; null when the policy auto-approved it. */
  authorizedBy: string | null
  calendarEventId: string | null
  /** Token Vault needs the operator's Google connection; without it the write never lands. */
  googleConnected: boolean
}) {
  const approved = variant === 'approved'
  const stone = approved ? 'var(--stone-time)' : 'var(--primary)'
  return (
    <div className="space-y-8">
      <div
        className="space-y-3.5 rounded-2xl border-2 p-8 sm:p-11"
        style={{ borderColor: stone, backgroundColor: `color-mix(in oklch, ${stone} 10%, transparent)` }}
      >
        <p
          className="font-display font-bold uppercase leading-[1.05] text-[clamp(2.75rem,7vw,4.5rem)]"
          style={{ color: stone }}
        >
          {approved ? 'Approved' : 'Declined'} &middot; {formatMoney(amount)}
        </p>
        <p className="text-xl text-foreground sm:text-2xl">
          {approved
            ? authorizedBy
              ? `Authorized by ${authorizedBy}`
              : 'Auto-approved under the $100,000 policy threshold'
            : `Declined by ${authorizedBy ?? 'the human approver'}`}
        </p>
      </div>

      {approved && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-hud/60 bg-hud/5 px-7 py-6 sm:px-8">
          <div className="space-y-1.5">
            <p className="font-display text-2xl font-bold text-foreground sm:text-[26px]">
              Repair inspection &mdash; claim {code}
            </p>
            {calendarEventId ? (
              <p className="flex items-center gap-2 text-base text-hud sm:text-[17px]">
                <CalendarCheck className="h-5 w-5" />
                Scheduled on the company calendar via Auth0 Token Vault
              </p>
            ) : googleConnected ? (
              <p className="flex items-center gap-2 text-base text-hud sm:text-[17px]">
                <span aria-hidden className="arc-reactor h-4 w-4" />
                Scheduling on the company calendar&hellip;
              </p>
            ) : (
              <p className="text-base text-gold sm:text-[17px]">
                Connect Google Calendar in pre-show settings to schedule it via Token Vault.
              </p>
            )}
          </div>
          <span className="hud-readout shrink-0 text-sm text-muted-foreground">
            Company calendar &middot; Token Vault
          </span>
        </div>
      )}

      <div className="relative flex items-center justify-center overflow-hidden py-16 sm:py-24">
        <span
          aria-hidden
          className="absolute h-[340px] w-[340px] rounded-full border border-hud/20 sm:h-[520px] sm:w-[520px]"
        />
        <span
          aria-hidden
          className="absolute h-[220px] w-[220px] rounded-full border border-hud/35 sm:h-[360px] sm:w-[360px]"
        />
        <p className="relative mx-auto max-w-[58ch] text-center font-display font-bold uppercase leading-[1.35] text-foreground text-[clamp(1.5rem,4vw,2rem)]">
          {CLOSING_LINE}
        </p>
      </div>
    </div>
  )
}
