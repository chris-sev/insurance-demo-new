import { Counters } from '@/components/stage/counters'
import { RequestQueueFull } from '@/components/stage/request-queue'
import type { RoomStats } from '@/lib/types'

/** Stage state before a claim is picked: QR on the left, room stats + queue on the right. */
export function IntakeStage({
  qrDataUrl,
  joinUrl,
  room,
  onPick,
  picking,
}: {
  qrDataUrl: string
  joinUrl: string
  room: RoomStats
  onPick: (sub: string) => void
  picking: boolean
}) {
  return (
    <div className="grid gap-10 lg:grid-cols-[560px_1fr] lg:items-start">
      <div className="mx-auto flex w-full max-w-[478px] flex-col items-center gap-7 text-center">
        <div className="hud-brackets relative flex aspect-square w-full max-w-[478px] items-center justify-center rounded-xl border border-hud/50 bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="Scan to join the room and file your claim"
            className="aspect-square w-[71%] rounded-md bg-background/60"
          />
        </div>
        <div>
          <p className="font-display text-[44px] font-bold uppercase leading-[1.05] tracking-tight text-foreground">
            Scan to file your claim
          </p>
          <p className="hud-readout mt-3 break-all text-sm text-muted-foreground">{joinUrl}</p>
        </div>
      </div>

      <div className="space-y-9">
        <Counters
          joined={room.joined}
          requests={room.requests}
          totalRequested={room.totalRequested}
        />
        <RequestQueueFull queue={room.queue} onPick={onPick} picking={picking} />
      </div>
    </div>
  )
}
