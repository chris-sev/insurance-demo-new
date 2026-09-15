'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Plays the `rise` entrance once the element scrolls into view, so the long
 * marketing page reveals section by section instead of animating everything
 * against a viewport the visitor can't see yet.
 *
 * `delay` staggers siblings. The observer disconnects after the first hit —
 * scrolling back up should not replay it.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // The markup ships at opacity 0, so anything that would leave it there is a
    // blank section rather than a missed animation. Reveal outright when there
    // is no observer to wait on, and when the element is already on screen at
    // mount — a tall viewport or a restored scroll position puts most of the
    // page in view before a single scroll event fires.
    if (typeof IntersectionObserver === 'undefined') {
      // Deliberate: the markup ships hidden, so this must flip on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(true)
      return
    }

    const rect = el.getBoundingClientRect()
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      setShown(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn(className, shown ? 'animate-rise' : 'opacity-0')}
      style={shown ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  )
}
