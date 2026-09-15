import { formatCompactMoney } from '@/components/stage/format'

/** Three gold projector counters: room size, request count, total requested. */
export function Counters({
  joined,
  requests,
  totalRequested,
}: {
  joined: number
  requests: number
  totalRequested: number
}) {
  return (
    <div className="flex flex-nowrap items-end gap-8 overflow-hidden sm:gap-10">
      <Counter value={joined.toLocaleString('en-US')} label="in the room" />
      <Counter value={requests.toLocaleString('en-US')} label="requests" />
      <Counter value={formatCompactMoney(totalRequested)} label="requested" />
    </div>
  )
}

function Counter({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="hud-readout font-display font-bold leading-none text-gold text-[clamp(2.5rem,5.2vw,6.75rem)]">
        {value}
      </p>
      <p className="mt-1.5 text-[18px] text-muted-foreground">{label}</p>
    </div>
  )
}
