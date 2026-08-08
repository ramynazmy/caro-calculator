/** Persist the current bill in localStorage so a refresh never loses work. */

import type { Bill } from '../types'

const BILL_STORAGE_KEY = 'billsplitter.bill.v1'

const CURRENT_VERSION = 6

/**
 * Bring an older saved bill up to the current schema, one step at a time.
 * Migrating rather than discarding means a bill half-entered before an app
 * update is still there afterwards.
 */
function migrate(raw: unknown): Bill | null {
  let bill = raw as Record<string, unknown>

  if (bill.version === 1) {
    // v1 -> v2: participants gained an organizer, and the split basis setting.
    bill = {
      ...bill,
      version: 2,
      participants: Array.isArray(bill.participants) ? bill.participants : [],
      organizerId: null,
      splitBasis: 'perPerson',
    }
  }

  if (bill.version === 2) {
    // v2 -> v3: claims, locking, and the tax/service split setting.
    bill = {
      ...bill,
      version: 3,
      chargeSplit: 'proportional',
      claims: {},
      locked: false,
      respondedAt: {},
      published: false,
    }
  }

  if (bill.version === 3) {
    // v3 -> v4: an explicit tip, and rounding shares up to a whole amount.
    // Both default to off, so an in-progress bill's numbers do not move.
    bill = {
      ...bill,
      version: 4,
      tips: { enabled: false, mode: 'percent', percent: 10, fixedMinor: 0 },
      roundUpTo: 0,
    }
  }

  if (bill.version === 4) {
    // v4 -> v5: an item's price can now be a line total rather than a unit
    // price, and a shared item can be split between named people. Existing
    // items were all unit-priced and shared with everyone, so the conversion
    // is a straight relabel that changes no numbers.
    const items = Array.isArray(bill.items) ? bill.items : []
    bill = {
      ...bill,
      version: 5,
      items: items.map((item: Record<string, unknown>) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        shared: item.shared,
        priceMinor: item.unitPriceMinor,
        priceMode: 'unit',
        sharedWith: null,
      })),
    }
  }

  if (bill.version === 5) {
    // v5 -> v6: a participant can be the guest of honour and pay nothing.
    // Nobody is, by default, so no existing bill's numbers change.
    const participants = Array.isArray(bill.participants) ? bill.participants : []
    bill = {
      ...bill,
      version: 6,
      participants: participants.map((p: Record<string, unknown>) => ({ ...p, treated: false })),
    }
  }

  return bill.version === CURRENT_VERSION ? (bill as unknown as Bill) : null
}

export function loadBill(): Bill | null {
  try {
    const raw = localStorage.getItem(BILL_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Anything from an unknown schema is discarded rather than risking a crash
    // on a half-understood shape.
    if (!parsed || !Array.isArray(parsed.items)) return null
    const bill = migrate(parsed)
    if (!bill) return null

    // The organizer must always point at a participant that still exists.
    if (bill.organizerId && !bill.participants.some((p) => p.id === bill.organizerId)) {
      bill.organizerId = bill.participants[0]?.id ?? null
    }
    return bill
  } catch {
    return null
  }
}

export function saveBill(bill: Bill): void {
  try {
    localStorage.setItem(BILL_STORAGE_KEY, JSON.stringify(bill))
  } catch {
    // Private-browsing mode or a full quota. Not worth interrupting the user
    // over — the app still works, it just will not survive a refresh.
  }
}

export function clearBill(): void {
  try {
    localStorage.removeItem(BILL_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
