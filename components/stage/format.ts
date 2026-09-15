const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

/** Full currency format — used everywhere except the intake total. */
export function formatMoney(amount: number): string {
  return money.format(amount)
}

/** Compact form ($4.2M) for amounts at or above $1,000,000; full format below that. */
export function formatCompactMoney(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = (amount / 1_000_000).toFixed(1).replace(/\.0$/, '')
    return `$${millions}M`
  }
  return money.format(amount)
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}
