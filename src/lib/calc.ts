/**
 * Bill maths. Pure functions, no React — so the numbers stay easy to reason
 * about and easy to test.
 */

import type { Bill, Charge } from '../types'
import { percentOfMinor } from './money'

/** Resolve a charge to an amount in minor units, given the base it applies to. */
function chargeAmount(charge: Charge, baseMinor: number): number {
  if (!charge.enabled) return 0
  return charge.mode === 'percent'
    ? percentOfMinor(baseMinor, charge.percent)
    : charge.fixedMinor
}

export interface BillTotals {
  /** Σ (unit price × quantity) over every item. */
  itemsSubtotalMinor: number
  discountMinor: number
  /** Subtotal after the discount — the base the other charges build on. */
  netSubtotalMinor: number
  serviceMinor: number
  taxMinor: number
  /** net + service + tax. What we believe the bill comes to. */
  calculatedTotalMinor: number
  /** actual − calculated. Positive means the receipt is higher than our maths. */
  differenceMinor: number | null
  /** True when the organizer typed a receipt total that does not match. */
  hasMismatch: boolean
}

/**
 * Order of operations (matches how Egyptian receipts are normally printed):
 *
 *   1. items subtotal
 *   2. − discount              → net subtotal
 *   3. + service, charged on the net subtotal
 *   4. + tax, charged on (net subtotal + service) by default
 *
 * Step 4's base is controlled by `bill.taxAppliesToService`, and only matters
 * when tax is entered as a percentage — a fixed tax amount is used verbatim.
 */
export function computeTotals(bill: Bill): BillTotals {
  const itemsSubtotalMinor = bill.items.reduce(
    (sum, item) => sum + item.unitPriceMinor * item.quantity,
    0,
  )

  // A discount can never take the bill below zero.
  const discountMinor = Math.min(
    chargeAmount(bill.discount, itemsSubtotalMinor),
    itemsSubtotalMinor,
  )
  const netSubtotalMinor = itemsSubtotalMinor - discountMinor

  const serviceMinor = chargeAmount(bill.service, netSubtotalMinor)

  const taxBase = bill.taxAppliesToService ? netSubtotalMinor + serviceMinor : netSubtotalMinor
  const taxMinor = chargeAmount(bill.tax, taxBase)

  const calculatedTotalMinor = netSubtotalMinor + serviceMinor + taxMinor

  const differenceMinor =
    bill.actualTotalMinor === null ? null : bill.actualTotalMinor - calculatedTotalMinor

  return {
    itemsSubtotalMinor,
    discountMinor,
    netSubtotalMinor,
    serviceMinor,
    taxMinor,
    calculatedTotalMinor,
    differenceMinor,
    hasMismatch: differenceMinor !== null && differenceMinor !== 0,
  }
}

/** Total humans at the table — the sum of every entry's party size. */
export function totalHeadcount(bill: Bill): number {
  return bill.participants.reduce((sum, p) => sum + p.partySize, 0)
}

/** Cost of the items flagged as shared by the whole table. */
export function sharedItemsTotalMinor(bill: Bill): number {
  return bill.items
    .filter((item) => item.shared)
    .reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0)
}

/**
 * How many equal shares a shared cost is cut into: heads or names, depending
 * on the setting. Never returns 0, so callers can divide without guarding.
 */
export function shareDivisor(bill: Bill): number {
  const divisor =
    bill.splitBasis === 'perPerson' ? totalHeadcount(bill) : bill.participants.length
  return Math.max(1, divisor)
}

/** How many shares one participant carries under the current setting. */
export function sharesFor(bill: Bill, participantId: string): number {
  if (bill.splitBasis === 'perEntry') return 1
  return bill.participants.find((p) => p.id === participantId)?.partySize ?? 1
}

/**
 * Work out the fixed service charge that would make our calculated total equal
 * the receipt exactly. Used by the "adjust service to match" shortcut, for the
 * common case where the restaurant rounded the service line its own way.
 *
 * Returns `null` when it is impossible (it would need a negative service).
 */
export function serviceToMatchActual(bill: Bill): number | null {
  if (bill.actualTotalMinor === null) return null

  const itemsSubtotalMinor = bill.items.reduce(
    (sum, item) => sum + item.unitPriceMinor * item.quantity,
    0,
  )
  const discountMinor = Math.min(
    chargeAmount(bill.discount, itemsSubtotalMinor),
    itemsSubtotalMinor,
  )
  const net = itemsSubtotalMinor - discountMinor
  const target = bill.actualTotalMinor

  if (!bill.tax.enabled) {
    const service = target - net
    return service >= 0 ? service : null
  }

  if (bill.tax.mode === 'fixed') {
    const service = target - net - bill.tax.fixedMinor
    return service >= 0 ? service : null
  }

  // Tax is a percentage. Solve for S.
  const r = bill.tax.percent / 100
  if (bill.taxAppliesToService) {
    // target = net + S + r·(net + S)  =>  S = target/(1+r) − net
    const service = Math.round(target / (1 + r) - net)
    return service >= 0 ? service : null
  }
  // target = net + S + r·net  =>  S = target − net·(1 + r)
  const service = Math.round(target - net * (1 + r))
  return service >= 0 ? service : null
}
