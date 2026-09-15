import { Button } from '@/components/ui/button'
import { formatMoney, firstName } from '@/components/stage/format'
import type { RoomRequest } from '@/lib/types'

/** The full queue — intake stage only. Largest amount first, capped at 8 by the API. */
export function RequestQueueFull({
  queue,
  onPick,
  picking,
}: {
  queue: RoomRequest[]
  onPick: (sub: string) => void
  picking: boolean
}) {
  if (queue.length === 0) {
    return (
      <p className="border-t border-border pt-6 text-base text-muted-foreground">
        No requests yet. Requests appear here as the room submits them.
      </p>
    )
  }

  return (
    <ul className="border-t border-border">
      {queue.map((request, index) => (
        <li
          key={request.sub}
          className="flex items-center gap-4 border-b border-border py-4"
        >
          <span className="hud-readout min-w-[7ch] shrink-0 text-[28px] font-semibold text-gold">
            {formatMoney(request.amount)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-base font-bold text-foreground">
                {firstName(request.name)}
              </span>
              {index === 0 && (
                <span className="hud-label rounded-sm border border-gold/45 bg-gold/12 px-2 py-0.5 text-gold">
                  Next up
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-lg text-foreground">
              &ldquo;{request.reason}&rdquo;
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onPick(request.sub)}
            disabled={picking}
            className="shrink-0"
          >
            Pick this
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Small footer strip shown during processing/exception/approved so participation pays off. */
export function RequestQueueCompact({ otherCount }: { otherCount: number }) {
  if (otherCount <= 0) return null
  return (
    <p className="hud-label text-center text-[0.7rem] text-muted-foreground">
      {otherCount.toLocaleString('en-US')} other request{otherCount === 1 ? '' : 's'} in the
      queue
    </p>
  )
}
