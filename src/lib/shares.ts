/**
 * Turning a bill plus a set of claims into "what each person owes".
 *
 * The guarantee this file exists to provide: **the shares always sum to the
 * calculated bill total, to the piastre.** Every division goes through
 * `allocate`, and the organizer absorbs the rounding leftovers.
 */

import type { Bill, BillItem } from '../types'
import { ceilToMultiple, computeTotals, roundUpStepMinor } from './calc'
import { itemTotalMinor, sharedGroup } from './items'
import type { BillTotals } from './calc'
import { allocate } from './allocate'

/** One line of what a person ate. */
export interface ShareLine {
  itemId: string
  name: string
  quantity: number
  amountMinor: number
  /** Set when this line was split between named people, e.g. 2 = "half each". */
  sharedWays?: number
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
  /** Their slice of the explicit tip. */
  tipsMinor: number
  /** netFood + service + tax + tips, before rounding. */
  subtotalMinor: number
  /** Added by rounding their share up to the next multiple. Goes to the tip. */
  roundUpMinor: number
  /** What they actually hand over — `subtotalMinor + roundUpMinor`. */
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
  /** Collected purely by rounding shares up. */
  roundUpTotalMinor: number
  /**
   * Everything the restaurant staff receive beyond the printed bill:
   * the explicit tip plus every piastre of round-up.
   */
  tipsTotalMinor: number
  /**
   * Sum of all shares. Equal to
   * `totals.calculatedTotalMinor + tipsTotalMinor` by construction.
   */
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
      roundUpTotalMinor: 0,
      tipsTotalMinor: totals.tipsMinor,
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
    const itemTotal = itemTotalMinor(item)

    if (item.shared) {
      const group = sharedGroup(item, people)

      if (group.length > 0) {
        // Split between named people — "we two split a pizza". Divided equally
        // between the names picked, not by headcount: when you explicitly say
        // "Caro and Sara are splitting this", you mean half each, and it would
        // be a surprise for Caro's party size to make it three-quarters.
        const weights = people.map((p) => (group.includes(p.id) ? 1 : 0))
        const perPerson = allocate(itemTotal, weights, organizerIndex)

        for (let i = 0; i < n; i++) {
          if (weights[i] === 0) continue
          personalMinor[i] += perPerson[i]
          lines[i].push({
            itemId: item.id,
            name: item.name,
            quantity: item.quantity,
            amountMinor: perPerson[i],
            sharedWays: group.length,
          })
        }
        continue
      }

      // Shared with the whole table; the entire line is communal.
      communal.push({
        itemId: item.id,
        name: item.name,
        quantity: item.quantity,
        amountMinor: itemTotal,
        isShared: true,
      })
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

    const unclaimedQty = Math.max(0, item.quantity - claimedTotal)

    // Divide the LINE TOTAL between the claimers and an "unclaimed" bucket,
    // weighted by quantity. Doing it this way rather than multiplying a unit
    // price means a line total that does not divide evenly — 100.00 across 3
    // teas — still adds back up to exactly 100.00. It also caps an over-claim
    // for free: when more is claimed than exists, `unclaimedQty` is 0 and the
    // claimers simply share the whole line.
    const weights = [...claimedPerPerson, unclaimedQty]
    const split = allocate(itemTotal, weights, organizerIndex)

    for (let i = 0; i < n; i++) {
      if (claimedPerPerson[i] === 0) continue
      personalMinor[i] += split[i]
      lines[i].push({
        itemId: item.id,
        name: item.name,
        quantity: claimedPerPerson[i],
        amountMinor: split[i],
      })
    }

    if (unclaimedQty > 0) {
      communal.push({
        itemId: item.id,
        name: item.name,
        quantity: unclaimedQty,
        amountMinor: split[n],
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

  // --- 4. Service, tax and the explicit tip ---------------------------------
  const chargeWeights = bill.chargeSplit === 'proportional' ? netFoodMinor : headWeights
  const servicePerPerson = allocate(totals.serviceMinor, chargeWeights, organizerIndex)
  const taxPerPerson = allocate(totals.taxMinor, chargeWeights, organizerIndex)
  const tipsPerPerson = allocate(totals.tipsMinor, chargeWeights, organizerIndex)

  // --- 5. Round each person up ---------------------------------------------
  // Applied per person, AFTER their exact share is known, so the underlying
  // split stays fair and only the final handover is tidied. Someone who owes
  // nothing is left at zero rather than being charged for the privilege.
  const step = roundUpStepMinor(bill)
  const subtotalMinor = netFoodMinor.map(
    (net, i) => net + servicePerPerson[i] + taxPerPerson[i] + tipsPerPerson[i],
  )
  const roundUpPerPerson = subtotalMinor.map((amount) => ceilToMultiple(amount, step) - amount)
  const roundUpTotalMinor = roundUpPerPerson.reduce((a, b) => a + b, 0)

  // --- 6. Assemble ----------------------------------------------------------
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
    tipsMinor: tipsPerPerson[i],
    subtotalMinor: subtotalMinor[i],
    roundUpMinor: roundUpPerPerson[i],
    totalMinor: subtotalMinor[i] + roundUpPerPerson[i],
    hasResponded: bill.respondedAt[person.id] !== undefined,
  }))

  return {
    totals,
    shares,
    communal,
    communalTotalMinor,
    overclaims,
    roundUpTotalMinor,
    // Everything above the printed bill ends up in the tip.
    tipsTotalMinor: totals.tipsMinor + roundUpTotalMinor,
    grandTotalMinor: shares.reduce((sum, s) => sum + s.totalMinor, 0),
    pendingParticipantIds: shares.filter((s) => !s.hasResponded).map((s) => s.participantId),
  }
}

function toCommunalLine(item: BillItem): CommunalLine {
  return {
    itemId: item.id,
    name: item.name,
    quantity: item.quantity,
    amountMinor: itemTotalMinor(item),
    isShared: item.shared,
  }
}
