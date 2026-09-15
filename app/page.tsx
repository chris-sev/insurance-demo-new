import Link from 'next/link'
import Image from 'next/image'
import { ShieldHalf } from 'lucide-react'
import { HeroActions, SiteNav } from '@/components/site-nav'
import { ComicCarousel } from '@/components/comic-carousel'
import { Reveal } from '@/components/reveal'

/**
 * Each coverage line is keyed to an Infinity Stone whose color also happens to
 * read as the hero responsible: Hulk green, Spidey blue, sling-ring orange,
 * Mjolnir yellow, hot-rod red, Thanos purple. `stone` drives the card's whole
 * palette through the [data-stone] hook in globals.css.
 */
const COVERAGE = [
  {
    stone: 'time',
    image: '/coverage/hulk-damage.jpg',
    alt: 'A sedan crumpled in a crater on a suburban lawn while a homeowner looks on.',
    title: 'Hulk Damage',
    description: 'Vehicle and property damage from the big green guy.',
  },
  {
    stone: 'space',
    image: '/coverage/web-slinger.jpg',
    alt: 'A parked car wrapped in thick white webbing on a city street.',
    title: 'Web-Slinger Accidents',
    description: 'Windshields and visibility blocked by webbing.',
  },
  {
    stone: 'soul',
    image: '/coverage/sorcery-portals.jpg',
    alt: 'A glowing orange portal spinning in the middle of a wrecked living room.',
    title: 'Sorcery & Portals',
    description: 'Dimensional damage from mystical incidents.',
  },
  {
    stone: 'mind',
    image: '/coverage/thunder-weather.jpg',
    alt: 'A house roof split open and smoking under a forked lightning bolt.',
    title: 'Thunder God Weather',
    description: 'Roof damage from lightning strikes and Bifrost incidents.',
  },
  {
    stone: 'reality',
    image: '/coverage/tech-malfunction.jpg',
    alt: 'A round smoking hole blasted through a storefront brick wall.',
    title: 'Tech Malfunction',
    description: 'Repulsor beam and Stark tech collateral.',
  },
  {
    stone: 'power',
    image: '/coverage/alien-invasion.jpg',
    alt: 'Wrecked alien machinery smoking in a city intersection as a crowd watches.',
    title: 'Alien Invasions',
    description: 'Extraterrestrial and interdimensional threats.',
  },
] as const

/** Fixed positions so the server and client render the same particles. */
const PARTICLES = [
  { top: '18%', left: '8%', size: 3, delay: '0s', color: 'var(--hud)' },
  { top: '62%', left: '14%', size: 2, delay: '1.4s', color: 'var(--gold)' },
  { top: '28%', left: '82%', size: 4, delay: '0.6s', color: 'var(--stone-soul)' },
  { top: '74%', left: '72%', size: 2, delay: '2.2s', color: 'var(--hud)' },
  { top: '44%', left: '46%', size: 2, delay: '3.1s', color: 'var(--stone-space)' },
  { top: '12%', left: '58%', size: 3, delay: '1.9s', color: 'var(--gold)' },
]

export default function Home() {
  return (
    <div className="min-h-screen">
      <SiteNav />

      {/* ---- Hero ---------------------------------------------------------- */}
      <section className="hud-grid relative overflow-hidden py-16 sm:py-20 lg:py-24">
        {/* Sling-ring portal idling behind the carousel — dialed down so it stays atmosphere, not foreground. */}
        <div className="portal-ring -right-40 top-10 h-[34rem] w-[34rem] opacity-20 blur-[1px]" />
        {/* Scan line drifting down the section. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px animate-scan bg-gradient-to-r from-transparent via-hud to-transparent opacity-60" />

        <div className="opacity-60">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              aria-hidden
              className="animate-float pointer-events-none absolute rounded-full"
              style={{
                top: p.top,
                left: p.left,
                width: p.size,
                height: p.size,
                background: p.color,
                boxShadow: `0 0 12px ${p.color}`,
                animationDelay: p.delay,
              }}
            />
          ))}
        </div>

        <div className="container relative mx-auto px-4 sm:px-6 lg:px-12">
          <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-14">
            {/* Copy */}
            <div>
              <h1 className="animate-rise stagger-1 font-display text-[clamp(2.5rem,1.4rem+3.6vw,3.6rem)] font-bold uppercase leading-[1.08] tracking-[-0.01em] text-foreground">
                Protection when
                <br />
                <span className="text-primary">heroes</span>{' '}
                <span className="text-gold">col</span>
                <span className="text-hud">lide</span>
                <br />
                with your life
              </h1>

              <p className="animate-rise stagger-2 mt-5 max-w-xl text-xl leading-[1.5] text-foreground">
                Not all heroes wear capes, but all heroes need coverage.
              </p>

              <div className="animate-rise stagger-4 mt-8">
                <HeroActions />
              </div>
            </div>

            {/* Field evidence: the comic carousel is the hero image. */}
            <div className="animate-rise stagger-3 min-w-0">
              <ComicCarousel />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Coverage ------------------------------------------------------- */}
      <section className="relative py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12">
          <Reveal className="mb-10 max-w-2xl">
            <span className="font-mono text-xs uppercase tracking-[0.1em] text-hud">Coverage</span>
            <h2 className="mt-3 font-display text-3xl font-bold uppercase leading-tight tracking-tight sm:text-4xl">
              Six lines. Every kind of collateral.
            </h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Underwritten for a specific class of incident.
            </p>
          </Reveal>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {COVERAGE.map(({ stone, image, alt, title, description }, i) => (
              <Reveal key={title} delay={i * 60}>
                <article
                  data-stone={stone}
                  className="group flex h-full flex-col overflow-hidden rounded-[10px] border border-border bg-card transition-colors duration-300 hover:border-[color-mix(in_oklch,var(--stone)_55%,transparent)]"
                >
                  <div className="relative aspect-[3/2] w-full overflow-hidden bg-muted">
                    <Image
                      src={image}
                      alt={alt}
                      fill
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                    />
                    {/* Ties each photo back to its coverage line's accent color. */}
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-[var(--stone)]" />
                  </div>
                  <div className="p-5">
                    <h3 className="font-display text-lg font-bold leading-snug">{title}</h3>
                    <p className="mt-1 text-sm leading-snug text-muted-foreground">
                      {description}
                    </p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Closing CTA ---------------------------------------------------- */}
      <section className="border-y border-border bg-card py-20 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12">
          <Reveal className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
            <h2 className="font-display text-[32px] font-bold uppercase leading-tight tracking-tight sm:text-[44px] sm:leading-[1.15]">
              Something super happened to your stuff?
            </h2>
            <p className="max-w-xl text-lg leading-[1.5] text-muted-foreground">
              Our Claims Supervisor runs five specialist checks on every request. Anything over
              $100,000 waits for a human approver, and approved repairs land on the company
              calendar via Auth0 Token Vault.
            </p>
            <div className="mt-2">
              <HeroActions />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---- Footer --------------------------------------------------------- */}
      <footer className="bg-background py-8">
        <div className="container mx-auto flex flex-col items-center gap-3 px-4 sm:flex-row sm:justify-between sm:px-6 lg:px-12">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid h-[26px] w-[26px] place-items-center rounded-md bg-gradient-to-br from-primary/30 to-transparent ring-1 ring-primary/40">
              <ShieldHalf className="h-3.5 w-3.5 text-primary" />
            </span>
            <span className="text-sm text-muted-foreground">Hero Shield Insurance · Sector 616</span>
          </Link>
          <p className="hud-readout text-[13px] tracking-[0.04em] text-muted-foreground">
            © 2026 Hero Shield Insurance
          </p>
        </div>
      </footer>
    </div>
  )
}
