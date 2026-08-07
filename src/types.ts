/**
 * Core data model for a bill.
 *
 * MONEY RULE (important): every money value in this app is stored as an
 * INTEGER number of *minor units* — piastres for EGP, cents for USD, fils for
 * KWD. We never store 12.34 as a float, because repeatedly adding floats
 * produces errors like 0.1 + 0.2 = 0.30000000000000004, and a bill splitter
 * that is off by a piastre is a bill splitter nobody trusts.
 * Field names carrying minor units end in `Minor` to make this obvious.
 */

/** A single line on the printed bill. */
export interface BillItem {
  id: string
  name: string
  /** Price of ONE unit, in minor units. */
  unitPriceMinor: number
  /** How many were ordered. Whole numbers only — needed so Phase 3 can track
   *  "3 of 4 claimed" without fractional bookkeeping. */
  quantity: number
  /**
   * Shared by the whole table (bread, mezze, water). Shared items are not
   * claimed by anyone individually; their cost is spread across the group.
   */
  shared: boolean
}

/** How a tax / service / discount amount is expressed. */
export type ChargeMode = 'percent' | 'fixed'

/**
 * An optional add-on (or take-off) charge on the bill.
 *
 * We deliberately keep BOTH `percent` and `fixedMinor` stored at all times, so
 * flipping the mode toggle back and forth never loses what you typed.
 */
export interface Charge {
  enabled: boolean
  mode: ChargeMode
  /** Used when mode === 'percent'. A plain number: 14 means 14%. */
  percent: number
  /** Used when mode === 'fixed'. Minor units. */
  fixedMinor: number
}

/**
 * A payer on the bill. One entry can cover several humans — Caro dining with
 * two guests is ONE participant with a party size of 3, and Caro settles for
 * all three.
 */
export interface Participant {
  id: string
  name: string
  /** How many humans this entry covers (Caro + two guests = 3). */
  partySize: number
}

/**
 * How costs that belong to nobody in particular — shared items, and anything
 * left unclaimed — get divided.
 *
 *  - `perPerson`: divide by total headcount, then charge each entry for its
 *    party size. Caro's family of 3 covers 3 shares of the mezze.
 *  - `perEntry`: divide by the number of names on the list, party size ignored.
 */
export type SplitBasis = 'perPerson' | 'perEntry'

/**
 * How tax and service are spread across people.
 *
 *  - `proportional`: in proportion to what each person's food cost. Someone
 *    who ate 300 pays three times the VAT of someone who ate 100.
 *  - `equal`: divided flat, using the same basis as `SplitBasis`.
 */
export type ChargeSplit = 'proportional' | 'equal'

/**
 * Who claimed what: `claims[participantId][itemId] = quantity`.
 *
 * Nested this way round (person first) because that is exactly how it is
 * stored in Firestore — one document per participant — which lets several
 * people write their picks at the same time without overwriting each other.
 */
export type Claims = Record<string, Record<string, number>>

export interface Bill {
  /** Schema version, so old saved bills can be migrated instead of crashing. */
  version: 3
  /** Doubles as the Firestore document id, so it is also the share link. */
  id: string
  /** Optional label, e.g. "Sequoia, Friday". */
  title: string
  /** ISO 4217 code, e.g. 'EGP'. */
  currency: string
  createdAt: number

  items: BillItem[]

  discount: Charge
  service: Charge
  tax: Charge
  /**
   * Egyptian receipts normally compute service on the food subtotal, then
   * charge VAT on (food + service). Set false if your restaurant taxes the
   * food only. Only affects the result when tax is a percentage.
   */
  taxAppliesToService: boolean

  /**
   * What the printed receipt actually says, in minor units. `null` until the
   * organizer types it in. Used purely as a cross-check against our own math.
   */
  actualTotalMinor: number | null

  participants: Participant[]

  /**
   * Who is collecting the money. Gets the leftover piastres when a share does
   * not divide evenly, so the shares always sum to the bill exactly.
   * `null` while there are no participants yet.
   */
  organizerId: string | null

  /** How shared and unclaimed costs are divided. */
  splitBasis: SplitBasis

  /** How tax and service are spread across people. */
  chargeSplit: ChargeSplit

  /** Who claimed which items, and how many. */
  claims: Claims

  /**
   * Frozen. Participants opening the share link see their picks read-only, so
   * the total cannot shift after the organizer has started collecting money.
   */
  locked: boolean

  /**
   * `participantId` -> when they last saved through the share link. Absence
   * means "has not responded yet", which is what the organizer wants to chase.
   */
  respondedAt: Record<string, number>

  /** True once the bill has been pushed to Firestore and has a live link. */
  published: boolean
}
