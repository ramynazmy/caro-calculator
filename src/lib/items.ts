/**
 * Reading a bill item's money, whichever way it was entered.
 *
 * Nothing outside this file should multiply `priceMinor` by `quantity` — that
 * is only correct in `unit` mode, and getting it wrong silently multiplies a
 * line total by its own quantity.
 */

import type { BillItem, Participant } from '../types'

/** What this whole line costs. The one number the rest of the app should use. */
export function itemTotalMinor(item: BillItem): number {
  return item.priceMode === 'line' ? item.priceMinor : item.priceMinor * item.quantity
}

/**
 * Cost of one unit, for display only.
 *
 * In `line` mode this can be a fraction of a piastre (100.00 over 3), so it is
 * rounded — which is exactly why it must never be used for arithmetic. When a
 * line total is split between people, `allocate` divides the *total*, so the
 * parts still add up.
 */
export function unitPriceDisplayMinor(item: BillItem): number {
  if (item.priceMode === 'unit') return item.priceMinor
  return item.quantity > 0 ? Math.round(item.priceMinor / item.quantity) : item.priceMinor
}

/** True when a unit price is worth showing — i.e. there is more than one. */
export function hasMeaningfulUnitPrice(item: BillItem): boolean {
  return item.quantity > 1
}

/** Items people claim individually. */
export function isClaimable(item: BillItem): boolean {
  return !item.shared
}

/** Split across the whole table, rather than a named few. */
export function isSharedWithEveryone(item: BillItem): boolean {
  return item.shared && (item.sharedWith === null || item.sharedWith.length === 0)
}

/**
 * The participants actually splitting this item, filtered to people who still
 * exist on the bill. Returns an empty array for everything else.
 */
export function sharedGroup(item: BillItem, participants: Participant[]): string[] {
  if (!item.shared || !item.sharedWith) return []
  const present = new Set(participants.map((p) => p.id))
  return item.sharedWith.filter((id) => present.has(id))
}
