'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Slide = {
  src: string
  alt: string
  quote: string
  amount: string
}

const SLIDES: Slide[] = [
  {
    src: '/comic/car-in-building.jpg',
    alt: 'A car rests crashed through the storefront wall of a city building.',
    quote: 'Hulk threw my car.',
    amount: '$1,000,000',
  },
  {
    src: '/comic/roof-crater.jpg',
    alt: 'A house roof punched through with a deep circular crater.',
    quote: 'A hero landed on my house.',
    amount: '$48,500',
  },
  {
    src: '/comic/lightning-pool.jpg',
    alt: 'A backyard swimming pool struck by a bolt of lightning.',
    quote: 'Lightning hit everything.',
    amount: '$12,300',
  },
  {
    src: '/comic/web-covered-house.jpg',
    alt: 'A house front wrapped roof to porch in thick strands of webbing.',
    quote: 'The webs are everywhere.',
    amount: '$7,900',
  },
]

/** Active slide width. The remainder of the track is the next slide peeking. */
const SLIDE_W = 'w-[86%] sm:w-[80%]'

/** Time each slide holds before the carousel advances on its own. */
const AUTOPLAY_MS = 5000

/**
 * Field-evidence carousel: 4 image slides on a CSS scroll-snap track, sized so
 * the next slide's leading edge peeks past the active one.
 *
 * Scrolling is done with `track.scrollTo` rather than `element.scrollIntoView`.
 * scrollIntoView walks up and scrolls *every* scrollable ancestor, so on a
 * viewport where the document itself can scroll sideways it drags the whole
 * page along with it. scrollTo only ever moves this track.
 */
export function ComicCarousel() {
  const trackRef = useRef<HTMLDivElement>(null)
  const slideRefs = useRef<(HTMLDivElement | null)[]>([])
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const stopped = useRef(false)

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
            const idx = slideRefs.current.findIndex((el) => el === entry.target)
            if (idx !== -1) setActive(idx)
          }
        }
      },
      { root: track, threshold: [0.6] },
    )

    slideRefs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  const goTo = useCallback((index: number) => {
    const track = trackRef.current
    const slide = slideRefs.current[index]
    if (!track || !slide) return
    // Dot state updates on click rather than waiting for the scroll to settle.
    setActive(index)
    track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' })
  }, [])

  /** A tap on an arrow or a dot ends autoplay for good — the visitor is driving. */
  const takeOver = useCallback(
    (index: number) => {
      stopped.current = true
      goTo(index)
    },
    [goTo],
  )

  // Wraps, like the autoplay does, so neither arrow is ever a dead end.
  const step = useCallback(
    (dir: 1 | -1) => takeOver((active + dir + SLIDES.length) % SLIDES.length),
    [active, takeOver],
  )

  // Advance on a timer, one timeout per slide so the clock restarts whenever the
  // slide changes for any reason. Paused on hover and focus (the visitor is
  // reading), on a hidden tab, and never started at all for reduced motion.
  useEffect(() => {
    if (stopped.current || paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setTimeout(() => goTo((active + 1) % SLIDES.length), AUTOPLAY_MS)
    return () => clearTimeout(timer)
  }, [active, paused, goTo])

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return (
    <div
      className="relative min-w-0"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative">
        <div
          ref={trackRef}
          role="region"
          aria-roledescription="carousel"
          aria-label="Field evidence"
          tabIndex={0}
          className="flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] focus-visible:outline-none [&::-webkit-scrollbar]:hidden"
        >
          {SLIDES.map((slide, i) => (
            <div
              key={slide.src}
              ref={(el) => {
                slideRefs.current[i] = el
              }}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${i + 1} of ${SLIDES.length}`}
              className={cn(
                'relative shrink-0 snap-start overflow-hidden rounded-2xl border border-border shadow-[0_24px_60px_-16px_rgba(0,0,0,0.55)]',
                SLIDE_W,
              )}
            >
              <div className="relative aspect-[7/5] w-full bg-muted">
                <Image
                  src={slide.src}
                  alt={slide.alt}
                  fill
                  sizes="(min-width: 1024px) 40vw, 86vw"
                  className="object-cover"
                  priority={i === 0}
                />
              </div>
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-[oklch(0.135_0.028_266_/_0.86)] px-4 py-3 sm:px-5 sm:py-4">
                <p className="max-w-[70%] font-sans text-base font-semibold leading-6 text-foreground sm:text-[19px]">
                  &ldquo;{slide.quote}&rdquo;
                </p>
                <span className="hud-readout shrink-0 font-mono text-base font-semibold text-gold sm:text-lg">
                  {slide.amount}
                </span>
              </div>
            </div>
          ))}
          {/* Lets the last slide snap to the left like every other one, so the
              active slide is always in the same place and the arrows with it. */}
          <div aria-hidden className="w-[14%] shrink-0 sm:w-[20%]" />
        </div>

        {/* Sized to the active slide so the arrows sit on its two edges, whatever
            the track width works out to. */}
        <div
          className={cn(
            'pointer-events-none absolute inset-y-0 left-0 flex items-center justify-between px-3',
            SLIDE_W,
          )}
        >
          <Arrow direction="prev" onClick={() => step(-1)} />
          <Arrow direction="next" onClick={() => step(1)} />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            aria-current={active === i}
            onClick={() => takeOver(i)}
            className={cn(
              'h-1.5 rounded-[3px] transition-[width,background-color] duration-200 ease-out',
              active === i ? 'w-[22px] bg-hud' : 'w-2 bg-border hover:bg-hud/60',
            )}
          />
        ))}
      </div>
    </div>
  )
}

function Arrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 'prev' ? 'Previous slide' : 'Next slide'}
      className="pointer-events-auto grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-background/80 text-foreground backdrop-blur transition-[transform,background-color] duration-150 ease-out hover:bg-background/95 active:scale-[0.94]"
    >
      <Icon className="h-5 w-5" />
    </button>
  )
}
