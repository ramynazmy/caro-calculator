/**
 * Turning a bill plus a set of claims into "what each person owes".
 *
 * The guarantee this file exists to provide: **the shares always sum to the
 * calculated bill total, to the piastre.** Every division goes through
 * `allocate`, and the organizer absorbs the rounding leftovers.
 */

import type { Bill, BillItem } from '../types'
import { computeTotals } from './calc'
import type { BillTotals } from './calc'
import { allocate } from './allocate'

/** One line of what a person ate. */
export interface ShareLine {
  itemId: string
  name: string
  quantity: number
  amountMinor: number
}

export interface ParticipantShare {
  participantId: string
  name: string
  partySize: number
  isOrganizer: boolean
  /** Items this person claimed. */
  lines: ShareLine[]
  /** Cost of the claimed items. */
  personalMinor: number
  /** Their slice of shared + unclaimed items. */
  communalMinor: number
  /** personal + communal. */
  foodMinor: number
  /** Their slice of the bill discount (a positive number that reduces food). */
  discountMinor: number
  /** food − discount. */
  netFoodMinor: number
  serviceMinor: number
  taxMinor: number
  /** What they actually pay. */
  totalMinor: number
  /** Has this person saved anything through the share link? */
  hasResponded: boolean
}

/** An item, or part of one, that nobody claimed. */
export interface CommunalLine {
  itemId: string
  name: string
  quantity: number
  amountMinor: number
  /** True when the organizer flagged it shared, false when simply unclaimed. */
  isShared: boolean
}

/** More of an item was claimed than was ordered. */
export interface OverclaimLine {
  itemId: string
  name: string
  orderedQuantity: number
  claimedQuantity: number
}

export interface SplitResult {
  totals: BillTotals
  shares: ParticipantShare[]
  /** Shared items and unclaimed leftovers, itemised for the summary screen. */
  communal: CommunalLine[]
  communalTotalMinor: number
  /** Non-empty when two people claimed the same portion — needs a human. */
  overclaims: OverclaimLine[]
  /** Sum of all shares. Equal to `totals.calculatedTotalMinor` by construction. */
  grandTotalMinor: number
  /** People who have not yet picked anything through the share link. */
  pendingParticipantIds: string[]
}

/** How many units of `item` a given participant has claimed. */
export function claimedQuantity(bill: Bill, participantId: string, itemId: string): number {
  return bill.claims[participantId]?.[itemId] ?? 0
}

/** Total units of `item` claimed across everybody. */
export function totalClaimed(bill: Bill, itemId: string): number {
  let sum = 0
  for (const byItem of Object.values(bill.claims)) sum += byItem[itemId] ?? 0
  return sum
}

/**
 * How many units of `item` are still up for grabs — what the claim screen
 * shows live so the group cannot between them claim four of three steaks.
 * `excludeParticipantId` leaves out one person's own claim, since their own
 * picks should not count against the maximum they are allowed to set.
 */
export function remainingQuantity(
  bill: Bill,
  item: BillItem,
  excludeParticipantId?: string,
): number {
  const claimedByOthers =
    totalClaimed(bill, item.id) -
    (excludeParticipantId ? claimedQuantity(bill, excludeParticipantId, item.id) : 0)
  return Math.max(0, item.quantity - claimedByOthers)
}

/** Items a participant can pick from: everything not flagged as shared. */
export function claimableItems(bill: Bill): BillItem[] {
  return bill.items.filter((item) => !item.shared)
}

export function computeShares(bill: Bill): SplitResult {
  const totals = computeTotals(bill)
  const people = bill.participants
  const n = people.length

  // The organizer absorbs every rounding leftover. -1 means "nobody
  // nominated", in which case `allocate` uses largest-remainder instead.
  const organizerIndex = people.findIndex((p) => p.id === bill.organizerId)

  if (n === 0) {
    return {
      totals,
      shares: [],
      communal: bill.items.map(toCommunalLine),
      communalTotalMinor: totals.itemsSubtotalMinor,
      overclaims: [],
      grandTotalMinor: 0,
      pendingParticipantIds: [],
    }
  }

  // --- 1. Claimed items -----------------------------------------------------
  const personalMinor = new Array<number>(n).fill(0)
  const lines: ShareLine[][] = people.map(() => [])
  const communal: CommunalLine[] = []
  const overclaims: OverclaimLine[] = []

  for (const item of bill.items) {
    const itemTotal = item.unitPriceMinor * item.quantity

    if (item.shared) {
      // Shared items are never claimable; the whole line is communal.
      if (itemTotal > 0 || item.quantity > 0) {
        communal.push({
          itemId: item.id,
          name: item.name,
          quantity: item.quantity,
          amountMinor: itemTotal,
          isShared: true,
        })
      }
      continue
    }

    const claimedPerPerson = people.map((p) => claimedQuantity(bill, p.id, item.id))
    const claimedTotal = claimedPerPerson.reduce((a, b) => a + b, 0)

    if (claimedTotal > item.quantity) {
      // Two people grabbed the same portion — possible when several phones
      // save at the same moment. Charge them proportionally so the bill still
      // reconciles, and flag it for the organizer to sort out.
      overclaims.push({
        itemId: item.id,
        name: item.name,
        orderedQuantity: item.quantity,
        claimedQuantity: claimedTotal,
      })
    }

    // Cost actually covered by claimers. Capped at the whole line, so an
    // over-claim can never bill more than was ordered.
    const claimedCost = Math.min(claimedTotal, item.quantity) * item.unitPriceMinor
    const perPerson = allocate(claimedCost, claimedPerPerson, organizerIndex)

    for (let i = 0; i < n; i++) {
      if (claimedPerPerson[i] === 0) continue
      personalMinor[i] += perPerson[i]
      lines[i].push({
        itemId: item.id,
        name: item.name,
        quantity: claimedPerPerson[i],
        amountMinor: perPerson[i],
      })
    }

    const unclaimedQty = Math.max(0, item.quantity - claimedTotal)
    if (unclaimedQty > 0) {
      communal.push({
        itemId: item.id,
        name: item.name,
        quantity: unclaimedQty,
        amountMinor: unclaimedQty * item.unitPriceMinor,
        isShared: false,
      })
    }
  }

  // --- 2. Communal costs: shared items + whatever nobody claimed ------------
  const communalTotalMinor = communal.reduce((sum, line) => sum + line.amountMinor, 0)

  // Per head, or per name, depending on the Phase 2 setting.
  const headWeights = people.map((p) => (bill.splitBasis === 'perPerson' ? p.partySize : 1))
  const communalPerPerson = allocate(communalTotalMinor, headWeights, organizerIndex)

  const foodMinor = personalMinor.map((personal, i) => personal + communalPerPerson[i])

  // --- 3. Discount, spread over what each person's food cost ----------------
  const discountPerPerson = allocate(totals.discountMinor, foodMinor, organizerIndex)
  const netFoodMinor = foodMinor.map((food, i) => food - discountPerPerson[i])

  // --- 4. Service and tax ---------------------------------------------------
  const chargeWeights = bill.chargeSplit === 'proportional' ? netFoodMinor : headWeights
  const servicePerPerson = allocate(totals.serviceMinor, chargeWeights, organizerIndex)
  const taxPerPerson = allocate(totals.taxMinor, chargeWeights, organizerIndex)

  // --- 5. Assemble ----------------------------------------------------------
  const shares: ParticipantShare[] = people.map((person, i) => ({
    participantId: person.id,
    name: person.name,
    partySize: person.partySize,
    isOrganizer: person.id === bill.organizerId,
    lines: lines[i],
    personalMinor: personalMinor[i],
    communalMinor: communalPerPerson[i],
    foodMinor: foodMinor[i],
    discountMinor: discountPerPerson[i],
    netFoodMinor: netFoodMinor[i],
    serviceMinor: servicePerPerson[i],
    taxMinor: taxPerPerson[i],
    totalMinor: netFoodMinor[i] + servicePerPerson[i] + taxPerPerson[i],
    hasResponded: bill.respondedAt[person.id] !== undefined,
  }))

  return {
    totals,
    shares,
    communal,
    communalTotalMinor,
    overclaims,
    grandTotalMinor: shares.reduce((sum, s) => sum + s.totalMinor, 0),
    pendingParticipantIds: shares.filter((s) => !s.hasResponded).map((s) => s.participantId),
  }
}

function toCommunalLine(item: BillItem): CommunalLine {
  return {
    itemId: item.id,
    name: item.name,
    quantity: item.quantity,
    amountMinor: item.unitPriceMinor * item.quantity,
    isShared: item.shared,
  }
}
