/**
 * "We bought 2 chickens. Ramy ate one; Koko and Maro split the other."
 *
 * An item is claimed OR shared as a whole, so a single line cannot express
 * this. The answer is to break the line into one line per unit, each divided
 * its own way. These tests pin down that the split preserves every piastre and
 * every existing claim.
 */
import { computeShares } from '../src/lib/shares'
import { computeTotals } from '../src/lib/calc'
import { itemTotalMinor } from '../src/lib/items'
import { allocate } from '../src/lib/allocate'
import { newId } from '../src/lib/id'
import type { Bill, BillItem, Claims } from '../src/types'

let failed = 0
function eq(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${JSON.stringify(got)}${ok ? '' : `, want ${JSON.stringify(want)}`}`)
}
function ok(label: string, cond: boolean, detail = '') {
  if (!cond) failed++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + detail}`)
}

const P = (id: string, name: string, partySize = 1, treated = false) => ({ id, name, partySize, treated })
const off = { enabled: false, mode: 'percent' as const, percent: 0, fixedMinor: 0 }

function bill(over: Partial<Bill> = {}): Bill {
  return {
    version: 6, id: 'b', title: 'T', currency: 'EGP', createdAt: 0,
    items: [], taxAppliesToService: true, actualTotalMinor: null,
    discount: off, service: off, tax: off, tips: off, roundUpTo: 0,
    participants: [], organizerId: null, splitBasis: 'perPerson',
    chargeSplit: 'proportional', claims: {}, locked: false,
    respondedAt: {}, published: false,
    ...over,
  }
}

/** Mirrors the `splitItem` case in BillContext. */
function splitItem(current: Bill, id: string): Bill {
  const index = current.items.findIndex((i) => i.id === id)
  if (index === -1) return current
  const item = current.items[index]
  if (item.quantity <= 1) return current

  const count = item.quantity
  const pieces: BillItem[] =
    item.priceMode === 'unit'
      ? Array.from({ length: count }, () => ({
          id: newId(), name: item.name, priceMinor: item.priceMinor,
          priceMode: 'unit' as const, quantity: 1,
          shared: item.shared, sharedWith: item.sharedWith,
        }))
      : allocate(itemTotalMinor(item), new Array(count).fill(1), 0).map((amount) => ({
          id: newId(), name: item.name, priceMinor: amount,
          priceMode: 'line' as const, quantity: 1,
          shared: item.shared, sharedWith: item.sharedWith,
        }))

  const claims: Claims = {}
  for (const [pid, byItem] of Object.entries(current.claims)) {
    const { [id]: _removed, ...rest } = byItem
    claims[pid] = rest
  }
  let piece = 0
  for (const [pid, byItem] of Object.entries(current.claims)) {
    const held = byItem[id] ?? 0
    for (let k = 0; k < held && piece < count; k++, piece++) {
      claims[pid] = { ...claims[pid], [pieces[piece].id]: 1 }
    }
  }

  const items = [...current.items]
  items.splice(index, 1, ...pieces)
  return { ...current, items, claims }
}

// ==================== the actual scenario ==================================
console.log('--- 2 chickens: one Ramy’s, one split between Koko and Maro ---')

const start = bill({
  participants: [P('r', 'Ramy'), P('k', 'Koko'), P('m', 'Maro')],
  organizerId: 'r',
  items: [{ id: 'chicken', name: 'Chicken', priceMinor: 15000, priceMode: 'unit', quantity: 2, shared: false, sharedWith: null }],
})
eq('the bill is 300.00 to start', computeTotals(start).itemsSubtotalMinor, 30000)

// 1. Split the line in two.
const afterSplit = splitItem(start, 'chicken')
eq('now two lines', afterSplit.items.length, 2)
eq('each of one', afterSplit.items.map((i) => i.quantity), [1, 1])
eq('total untouched by splitting', computeTotals(afterSplit).itemsSubtotalMinor, 30000)

// 2. Line one to Ramy; line two split between Koko and Maro.
const [lineA, lineB] = afterSplit.items
const configured: Bill = {
  ...afterSplit,
  items: [lineA, { ...lineB, shared: true, sharedWith: ['k', 'm'] }],
  claims: { r: { [lineA.id]: 1 } },
}

const result = computeShares(configured)
eq('Ramy pays for a whole chicken', result.shares[0].totalMinor, 15000)
eq('Koko pays half of one', result.shares[1].totalMinor, 7500)
eq('Maro pays half of one', result.shares[2].totalMinor, 7500)
eq('and it still comes to 300.00', result.grandTotalMinor, 30000)
eq('nothing was left unclaimed', result.communalTotalMinor, 0)
eq('the shared line is labelled', result.shares[1].lines[0].sharedWays, 2)

// With service and tax on top, the proportions must carry through.
const taxed = computeShares({
  ...configured,
  service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 },
})
const taxedTotals = computeTotals({ ...configured, service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 }, tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 } })
eq('Ramy carries twice the service of each of the others',
   taxed.shares[0].serviceMinor, taxed.shares[1].serviceMinor + taxed.shares[2].serviceMinor)
eq('bill with charges still reconciles', taxed.grandTotalMinor, taxedTotals.calculatedTotalMinor)

// ==================== splitting keeps the money ============================
console.log('\n--- splitting never loses a piastre ---')

// A line total that does not divide evenly: 100.00 across 3.
const awkward = bill({
  participants: [P('a', 'A'), P('b', 'B'), P('c', 'C')],
  organizerId: 'a',
  items: [{ id: 'tea', name: 'Tea', priceMinor: 10000, priceMode: 'line', quantity: 3, shared: false, sharedWith: null }],
})
const awkwardSplit = splitItem(awkward, 'tea')
eq('three lines', awkwardSplit.items.length, 3)
eq('34 / 33 / 33 in piastres', awkwardSplit.items.map((i) => i.priceMinor), [3334, 3333, 3333])
eq('and they still total 100.00', computeTotals(awkwardSplit).itemsSubtotalMinor, 10000)

// ==================== existing claims survive ==============================
console.log('\n--- claims are re-homed, not lost ---')
const claimedFirst = bill({
  participants: [P('a', 'A'), P('b', 'B')],
  organizerId: 'a',
  items: [{ id: 'x', name: 'X', priceMinor: 5000, priceMode: 'unit', quantity: 3, shared: false, sharedWith: null }],
  claims: { a: { x: 2 }, b: { x: 1 } },
})
const reclaimed = splitItem(claimedFirst, 'x')
const aHolds = Object.keys(reclaimed.claims.a ?? {}).length
const bHolds = Object.keys(reclaimed.claims.b ?? {}).length
eq('A still holds two pieces', aHolds, 2)
eq('B still holds one', bHolds, 1)
eq('no reference to the old line remains',
   Object.values(reclaimed.claims).some((c) => 'x' in c), false)
const reclaimedResult = computeShares(reclaimed)
eq('A still pays for two', reclaimedResult.shares[0].totalMinor, 10000)
eq('B still pays for one', reclaimedResult.shares[1].totalMinor, 5000)
eq('nothing became unclaimed', reclaimedResult.communalTotalMinor, 0)

// ==================== guards ===============================================
console.log('\n--- guards ---')
const single = bill({ items: [{ id: 'one', name: 'One', priceMinor: 1000, priceMode: 'unit', quantity: 1, shared: false, sharedWith: null }] })
eq('a quantity of 1 is left alone', splitItem(single, 'one').items.length, 1)
eq('an unknown id changes nothing', splitItem(single, 'nope').items.length, 1)

// A shared item carries its sharing across to every piece.
const sharedSplit = splitItem(bill({
  items: [{ id: 's', name: 'S', priceMinor: 6000, priceMode: 'unit', quantity: 2, shared: true, sharedWith: null }],
}), 's')
ok('pieces stay shared', sharedSplit.items.every((i) => i.shared))

// ==================== fuzz =================================================
console.log('\n--- fuzz: splitting any line preserves the subtotal ---')
let seed = 777
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
let drift = 0, lostClaims = 0

for (let round = 0; round < 3000; round++) {
  const qty = 1 + Math.floor(rnd() * 6)
  const mode = rnd() < 0.5 ? ('unit' as const) : ('line' as const)
  const item: BillItem = {
    id: 'it', name: 'It', priceMinor: 1 + Math.floor(rnd() * 50000),
    priceMode: mode, quantity: qty, shared: rnd() < 0.3, sharedWith: null,
  }
  const people = [P('a', 'A'), P('b', 'B'), P('c', 'C')]
  const claims: Claims = {}
  let handed = 0
  for (const p of people) {
    const take = Math.min(Math.floor(rnd() * 3), qty - handed)
    if (take > 0 && !item.shared) { claims[p.id] = { it: take }; handed += take }
  }
  const before = bill({ participants: people, organizerId: 'a', items: [item], claims })
  const after = splitItem(before, 'it')

  if (computeTotals(before).itemsSubtotalMinor !== computeTotals(after).itemsSubtotalMinor) drift++
  const claimedBefore = Object.values(claims).reduce((n, c) => n + (c.it ?? 0), 0)
  const claimedAfter = Object.values(after.claims).reduce((n, c) => n + Object.keys(c).length, 0)
  if (qty > 1 && claimedAfter !== claimedBefore) lostClaims++
}
ok('3,000 splits preserve the subtotal exactly', drift === 0, `${drift} drifted`)
ok('and no claim is dropped', lostClaims === 0, `${lostClaims} lost`)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
