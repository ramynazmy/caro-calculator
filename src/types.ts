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

/**
 * How the number on an item line should be read.
 *
 * Receipts are inconsistent: some print the price of one unit, others print
 * the total for the whole line. `"3 Tea   45.00"` could mean either.
 *
 * We store whichever the organizer actually typed rather than converting,
 * because converting loses money. `"3 Tea  100.00"` as a unit price is 33.33,
 * and 33.33 × 3 is 99.99 — a piastre short, which would make the receipt
 * cross-check complain about a bill that is perfectly correct.
 */
export type PriceMode = 'unit' | 'line'

/** A single line on the printed bill. */
export interface BillItem {
  id: string
  name: string
  /**
   * The figure printed on the receipt, in minor units. Whether it means one
   * unit or the whole line is decided by `priceMode` — always read it through
   * `itemTotalMinor()` rather than multiplying it yourself.
   */
  priceMinor: number
  priceMode: PriceMode
  /** How many were ordered. Whole numbers only, so claims stay countable. */
  quantity: number
  /**
   * Split rather than claimed. Combined with `sharedWith`:
   *
   *   shared: false                  -> people claim it individually
   *   shared: true,  sharedWith: null -> split across the whole table
   *   shared: true,  sharedWith: [id] -> split only between those people
   *
   * The third case is the "we two split a pizza" one.
   */
  shared: boolean
  /**
   * Participant ids sharing this item, or `null` for the whole table.
   * Only meaningful when `shared` is true.
   */
  sharedWith: string[] | null
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
  /**
   * The guest of honour — a birthday, a leaving do, someone being treated.
   *
   * They pay nothing. Whatever they ate, plus the share of the shared items,
   * service and tax that would have been theirs, is redistributed across
   * everybody else. Their card still lists what they had, at zero, so the
   * table can see they were included rather than left out.
   *
   * Ignored if *everyone* is marked as treated, since then nobody would be
   * paying the bill.
   */
  treated: boolean
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
  version: 6
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
   * A tip, on top of the printed bill.
   *
   * Deliberately NOT part of `calculatedTotal`: the receipt cross-check on the
   * Bill tab compares our maths against what the restaurant printed, and a tip
   * is money the restaurant never printed. Folding it in would make every
   * correctly-entered bill look like a mismatch.
   *
   * When expressed as a percentage it is a percentage of the food subtotal
   * after any discount — the same base the service charge uses.
   */
  tips: Charge
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

  /** How tax, service and tips are spread across people. */
  chargeSplit: ChargeSplit

  /**
   * Round every person's share UP to the next multiple of this many whole
   * currency units — 5 means everyone pays a round multiple of 5 EGP. `0`
   * turns it off.
   *
   * Stored in MAJOR units, not minor, so it stays meaningful when the currency
   * changes: 5 means "5 of whatever this is", whether that is 500 piastres or
   * 5000 fils.
   *
   * Everything the rounding collects goes to the tip — nobody is quietly
   * overcharged, the surplus just lands somewhere sensible.
   */
  roundUpTo: number

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
