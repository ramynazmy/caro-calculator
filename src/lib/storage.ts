/** Persist the current bill in localStorage so a refresh never loses work. */

import type { Bill } from '../types'

const BILL_STORAGE_KEY = 'billsplitter.bill.v1'

const CURRENT_VERSION = 3

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
