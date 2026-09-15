import { formatMoney, firstName } from '@/components/stage/format'

/** Identity of the claim on stage: code, amount, the verbatim reason, and who asked. */
export function ShowcaseHeader({
  code,
  amount,
  reason,
  customerName,
}: {
  code: string
  amount: number
  reason: string
  customerName: string
}) {
  return (
    <div className="space-y-3 text-center lg:text-left">
      <span className="hud-label text-[13px]">Showcase request &middot; {code}</span>
      <p className="hud-readout font-display font-bold leading-none text-gold text-[clamp(3rem,8vw,6.5rem)]">
        {formatMoney(amount)}
      </p>
      <p className="font-display text-[clamp(1.75rem,4vw,2.5rem)] leading-snug text-foreground">
        &ldquo;{reason}&rdquo;
      </p>
      <p className="text-[20px] text-muted-foreground">
        Requested by {firstName(customerName)} &middot; customer
      </p>
    </div>
  )
}
