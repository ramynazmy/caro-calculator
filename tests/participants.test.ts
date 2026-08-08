import { totalHeadcount, shareDivisor, sharesFor, sharedItemsTotalMinor } from '../src/lib/calc'
import { loadBill } from '../src/lib/storage'
import type { Bill } from '../src/types'

let failed = 0
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`)
}

const P = (id: string, name: string, partySize: number) => ({ id, name, partySize })
const I = (id: string, price: number, qty: number, shared: boolean) =>
  ({ id, name: id, priceMinor: price, priceMode: 'unit' as const, quantity: qty, shared, sharedWith: null })

function bill(over: Partial<Bill> = {}): Bill {
  return {
    version: 5, id: 'b', title: '', currency: 'EGP', createdAt: 0,
    items: [], taxAppliesToService: true, actualTotalMinor: null,
    chargeSplit: 'proportional', claims: {}, locked: false,
    respondedAt: {}, published: false,
    discount: { enabled: false, mode: 'percent', percent: 0, fixedMinor: 0 },
    service: { enabled: false, mode: 'percent', percent: 12, fixedMinor: 0 },
    tax: { enabled: false, mode: 'percent', percent: 14, fixedMinor: 0 },
    tips: { enabled: false, mode: 'percent', percent: 10, fixedMinor: 0 }, roundUpTo: 0,
    participants: [], organizerId: null, splitBasis: 'perPerson',
    ...over,
  }
}

// Caro (+2 guests) = 3, Sara alone, Omar (+partner) = 2  ->  4 entries? no, 3 names, 6 heads
const group = bill({
  participants: [P('a', 'Caro', 3), P('s', 'Sara', 1), P('o', 'Omar', 2)],
  items: [I('mezze', 12000, 1, true), I('bread', 3000, 2, true), I('steak', 25000, 1, false)],
})

eq('headcount 3+1+2', totalHeadcount(group), 6)
eq('shared items = mezze 120 + bread 2x30', sharedItemsTotalMinor(group), 18000)

// --- perPerson: divide by heads --------------------------------------------
eq('perPerson divisor', shareDivisor(group), 6)
eq('perPerson Caro shares', sharesFor(group, 'a'), 3)
eq('perPerson Sara shares', sharesFor(group, 's'), 1)
// 180.00 shared / 6 heads = 30.00 per head; Caro's family covers 90.00
eq('perPerson Caro pays of shared', (18000 / 6) * sharesFor(group, 'a'), 9000)

// --- perEntry: divide by names ---------------------------------------------
const byEntry = { ...group, splitBasis: 'perEntry' as const }
eq('perEntry divisor', shareDivisor(byEntry), 3)
eq('perEntry Caro shares', sharesFor(byEntry, 'a'), 1)
eq('perEntry Caro pays of shared', 18000 / 3, 6000)

// --- divisor never zero (would be a divide-by-zero crash) -------------------
eq('empty bill divisor', shareDivisor(bill()), 1)
eq('empty bill headcount', totalHeadcount(bill()), 0)
eq('unknown participant defaults to 1 share', sharesFor(group, 'nope'), 1)

// --- storage migration v1 -> v2 --------------------------------------------
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

// A bill exactly as the Phase 1 build wrote it: version 1, no organizer, no
// splitBasis, and items carrying `unitPriceMinor` rather than today's
// `priceMinor`/`priceMode`. Written out literally rather than via the current
// factory — using today's shape here would test nothing.
store.set('billsplitter.bill.v1', JSON.stringify({
  version: 1, id: 'old', title: 'Old bill', currency: 'EGP', createdAt: 1,
  items: [{ id: 'koshari', name: 'Koshari', unitPriceMinor: 5000, quantity: 2, shared: false }],
  discount: { enabled: false, mode: 'percent', percent: 0, fixedMinor: 0 },
  service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 },
  taxAppliesToService: true, actualTotalMinor: null, participants: [],
}))
const migrated = loadBill()
eq('v1 bill survives upgrade', migrated?.title, 'Old bill')
eq('v1 items preserved', migrated?.items.length, 1)
eq('v1 service preserved', migrated?.service.percent, 12)
eq('v1 migrated all the way to v5', migrated?.version, 5)
eq('v3 fields defaulted', [migrated?.chargeSplit, migrated?.locked, migrated?.published], ['proportional', false, false])
eq('v4 fields defaulted (tips off, no rounding)', [migrated?.tips.enabled, migrated?.roundUpTo], [false, 0])
eq('v5: items relabelled without changing the numbers', [migrated?.items[0].priceMinor, migrated?.items[0].priceMode, migrated?.items[0].sharedWith], [5000, 'unit', null])
eq('splitBasis defaulted', migrated?.splitBasis, 'perPerson')
eq('organizerId defaulted', migrated?.organizerId, null)

// A v2 bill whose organizer was deleted out from under it.
store.set('billsplitter.bill.v1', JSON.stringify(bill({
  participants: [P('s', 'Sara', 1)],
  organizerId: 'ghost',
})))
eq('dangling organizer repointed', loadBill()?.organizerId, 's')

// Garbage is discarded, not crashed on.
store.set('billsplitter.bill.v1', '{"nonsense":true}')
eq('garbage -> null', loadBill(), null)
store.set('billsplitter.bill.v1', 'not json at all')
eq('bad json -> null', loadBill(), null)
store.set('billsplitter.bill.v1', JSON.stringify({ version: 99, items: [] }))
eq('future version -> null', loadBill(), null)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
