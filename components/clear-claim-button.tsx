'use client'

import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const CONFIRM =
  'Start over? This deletes the current claim — including an approved claim with a calendar event — plus its chat, CIBA votes, and the seated board. Joiners, board rules, and Google Calendar stay.'

export function ClearClaimButton({
  onCleared,
  size = 'sm',
  variant = 'destructive',
}: {
  onCleared: () => Promise<void>
  size?: 'sm' | 'default'
  variant?: 'destructive' | 'outline'
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    if (!window.confirm(CONFIRM)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/claims/reset', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'Reset failed')
      await onCleared()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={() => void run()}
        disabled={busy}
      >
        <RotateCcw className="h-4 w-4" />
        {busy ? 'Clearing…' : 'Start over'}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-destructive">{error}</p>}
    </div>
  )
}
