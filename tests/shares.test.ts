import { allocate } from '../src/lib/allocate'
import { computeShares, remainingQuantity, totalClaimed } from '../src/lib/shares'
import { computeTotals } from '../src/lib/calc'
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
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)

// ============================ allocate ====================================
console.log('--- allocate ---')
eq('splits 100 three ways exactly', allocate(10000, [1, 1, 1], 0), [3334, 3333, 3333])
ok('...and sums to the input', sum(allocate(10000, [1, 1, 1], 0)) === 10000)
eq('weighted 2:1:1', allocate(10000, [2, 1, 1], 0), [5000, 2500, 2500])
eq('residue lands on the nominated index', allocate(100, [1, 1, 1], 2), [33, 33, 34])
eq('zero total', allocate(0, [1, 2, 3], 0), [0, 0, 0])
eq('no recipients', allocate(500, [], 0), [])
eq('all weights zero -> even split', allocate(1000, [0, 0, 0], 0), [334, 333, 333])
eq('absorber with zero weight is skipped', allocate(100, [0, 1, 1], 0), [0, 50, 50])
// largest-remainder path: 100 over weights 1,1,1 with no absorber
eq('largest remainder fallback', allocate(100, [1, 1, 1], -1), [34, 33, 33])
ok('never returns negatives', allocate(7, [5, 3, 1], 0).every((v) => v >= 0))

// exhaustive: every total 0..300 over 7 uneven weights must sum exactly
let allocOk = true
for (let total = 0; total <= 300; total++) {
  const parts = allocate(total, [5, 3, 11, 1, 8, 2, 7], 3)
  if (sum(parts) !== total) { allocOk = false; break }
}
ok('sums exactly for every total 0..300 (7 uneven weights)', allocOk)

// ============================ fixtures ====================================
const P = (id: string, name: string, partySize = 1, treated = false) => ({ id, name, partySize, treated })
const I = (id: string, price: number, qty = 1, shared = false): BillItem =>
  ({ id, name: id, priceMinor: price, priceMode: 'unit', quantity: qty, shared, sharedWith: null })
/** An item whose printed figure is the total for the whole line. */
const L = (id: string, lineTotal: number, qty: number, shared = false): BillItem =>
  ({ id, name: id, priceMinor: lineTotal, priceMode: 'line', quantity: qty, shared, sharedWith: null })
/** A shared item split between named participants. */
const G = (id: string, price: number, ids: string[]): BillItem =>
  ({ id, name: id, priceMinor: price, priceMode: 'line', quantity: 1, shared: true, sharedWith: ids })

function bill(over: Partial<Bill> = {}): Bill {
  return {
    version: 6, id: 'b', title: 'T', currency: 'EGP', createdAt: 0,
    items: [], taxAppliesToService: true, actualTotalMinor: null,
    discount: { enabled: false, mode: 'percent', percent: 0, fixedMinor: 0 },
    service: { enabled: false, mode: 'percent', percent: 12, fixedMinor: 0 },
    tax: { enabled: false, mode: 'percent', percent: 14, fixedMinor: 0 },
    tips: { enabled: false, mode: 'percent', percent: 10, fixedMinor: 0 }, roundUpTo: 0,
    participants: [], organizerId: null, splitBasis: 'perPerson',
    chargeSplit: 'proportional', claims: {}, locked: false,
    respondedAt: {}, published: false,
    ...over,
  }
}

// ============================ basic split =================================
console.log('\n--- basic split ---')
const simple = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('steak', 20000), I('salad', 5000)],
  claims: { a: { steak: 1 }, s: { salad: 1 } },
})
const r1 = computeShares(simple)
eq('Caro pays for the steak', r1.shares[0].totalMinor, 20000)
eq('Sara pays for the salad', r1.shares[1].totalMinor, 5000)
eq('grand total', r1.grandTotalMinor, 25000)
eq('nothing communal', r1.communalTotalMinor, 0)

// ============================ shared items ================================
console.log('\n--- shared items ---')
const withShared = bill({
  participants: [P('a', 'Caro', 3), P('s', 'Sara', 1), P('o', 'Omar', 2)],
  organizerId: 'a',
  items: [I('mezze', 18000, 1, true), I('steak', 20000)],
  claims: { s: { steak: 1 } },
})
const r2 = computeShares(withShared)
// 180.00 shared over 6 heads = 30.00/head -> Caro 90, Sara 30, Omar 60
eq('per-person: Caro 3 heads', r2.shares[0].communalMinor, 9000)
eq('per-person: Sara 1 head', r2.shares[1].communalMinor, 3000)
eq('per-person: Omar 2 heads', r2.shares[2].communalMinor, 6000)
eq('Sara = steak + her mezze share', r2.shares[1].totalMinor, 23000)
eq('grand total = 180 + 200', r2.grandTotalMinor, 38000)

const perEntry = computeShares({ ...withShared, splitBasis: 'perEntry' })
eq('per-entry: everyone 60.00', perEntry.shares.map((s) => s.communalMinor), [6000, 6000, 6000])
eq('per-entry grand total unchanged', perEntry.grandTotalMinor, 38000)

// ============================ unclaimed ===================================
console.log('\n--- unclaimed items ---')
const unclaimed = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('steak', 20000, 2), I('juice', 3000, 1)],
  claims: { a: { steak: 1 } },        // 1 steak + the juice go unclaimed
})
const r3 = computeShares(unclaimed)
eq('two communal lines', r3.communal.length, 2)
eq('communal total = 1 steak + juice', r3.communalTotalMinor, 23000)
eq('unclaimed flagged as not-shared', r3.communal.every((c) => !c.isShared), true)
eq('grand total still the whole bill', r3.grandTotalMinor, 43000)
eq('Caro: steak 200 + half of 230', r3.shares[0].totalMinor, 31500)

// ============================ over-claiming ===============================
console.log('\n--- over-claiming (two phones at once) ---')
const over = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('steak', 20000, 1)],       // one steak...
  claims: { a: { steak: 1 }, s: { steak: 1 } },  // ...claimed twice
})
const r4 = computeShares(over)
eq('overclaim detected', r4.overclaims.length, 1)
eq('overclaim details', [r4.overclaims[0].orderedQuantity, r4.overclaims[0].claimedQuantity], [1, 2])
eq('charged 100.00 each, not 200.00', r4.shares.map((s) => s.totalMinor), [10000, 10000])
eq('bill total not inflated', r4.grandTotalMinor, 20000)

// ============================ tax & service ===============================
console.log('\n--- tax & service distribution ---')
const taxed = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('steak', 30000), I('soup', 10000)],
  claims: { a: { steak: 1 }, s: { soup: 1 } },
  service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 },
})
const tTotals = computeTotals(taxed)
const rProp = computeShares(taxed)
eq('service total', tTotals.serviceMinor, 4800)     // 400 * .12
eq('tax total', tTotals.taxMinor, 6272)             // 448 * .14
// proportional: Caro ate 3/4 of the food
eq('proportional service 3:1', [rProp.shares[0].serviceMinor, rProp.shares[1].serviceMinor], [3600, 1200])
eq('proportional tax 3:1', [rProp.shares[0].taxMinor, rProp.shares[1].taxMinor], [4704, 1568])
eq('proportional grand = calculated', rProp.grandTotalMinor, tTotals.calculatedTotalMinor)

const rEq = computeShares({ ...taxed, chargeSplit: 'equal' })
eq('equal service split', [rEq.shares[0].serviceMinor, rEq.shares[1].serviceMinor], [2400, 2400])
eq('equal tax split', [rEq.shares[0].taxMinor, rEq.shares[1].taxMinor], [3136, 3136])
eq('equal grand = calculated', rEq.grandTotalMinor, tTotals.calculatedTotalMinor)
ok('equal split changes who pays what', rEq.shares[0].totalMinor !== rProp.shares[0].totalMinor)

// ============================ discount ====================================
console.log('\n--- discount ---')
const disc = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('steak', 30000), I('soup', 10000)],
  claims: { a: { steak: 1 }, s: { soup: 1 } },
  discount: { enabled: true, mode: 'percent', percent: 10, fixedMinor: 0 },
})
const r5 = computeShares(disc)
eq('discount shared 3:1', [r5.shares[0].discountMinor, r5.shares[1].discountMinor], [3000, 1000])
eq('grand total after discount', r5.grandTotalMinor, 36000)

// ============================ remaining quantity ==========================
console.log('\n--- remaining-quantity validation ---')
const qty = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar')],
  items: [I('steak', 20000, 3)],
  claims: { a: { steak: 2 } },
})
const steak = qty.items[0]
eq('total claimed', totalClaimed(qty, 'steak'), 2)
eq('Sara may take 1 more', remainingQuantity(qty, steak, 's'), 1)
eq('Caro may hold up to 3 (own claim not counted against her)', remainingQuantity(qty, steak, 'a'), 3)
eq('nobody excluded -> 1 free', remainingQuantity(qty, steak), 1)

// ============================ degenerate cases ============================
console.log('\n--- degenerate cases ---')
eq('no participants -> no shares', computeShares(bill({ items: [I('x', 100)] })).shares.length, 0)
const noFood = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [],
  service: { enabled: true, mode: 'fixed', percent: 0, fixedMinor: 5000 },
}))
eq('service with no food still lands somewhere', noFood.grandTotalMinor, 5000)
eq('...split evenly', noFood.shares.map((s) => s.totalMinor), [2500, 2500])

const noOrganizer = computeShares(bill({
  participants: [P('a', 'A'), P('s', 'S'), P('o', 'O')],
  organizerId: null,
  items: [I('x', 10000, 1, true)],
}))
eq('no organizer -> largest remainder still exact', noOrganizer.grandTotalMinor, 10000)

// ============================ THE INVARIANT ===============================
// The one property the whole app rests on: whatever the inputs, the sum of
// what everybody pays equals the bill total, to the piastre.
console.log('\n--- fuzz: shares must always sum to the bill total ---')
let seed = 12345
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]

let mismatches = 0
let negatives = 0
let worstOrganizerDrift = 0
const ROUNDS = 5000

for (let round = 0; round < ROUNDS; round++) {
  const nPeople = 1 + Math.floor(rnd() * 7)
  const people = Array.from({ length: nPeople }, (_, i) => P(`p${i}`, `P${i}`, 1 + Math.floor(rnd() * 4)))
  const nItems = 1 + Math.floor(rnd() * 8)
  const items = Array.from({ length: nItems }, (_, i) =>
    I(`i${i}`, 1 + Math.floor(rnd() * 50000), 1 + Math.floor(rnd() * 4), rnd() < 0.25))

  const claims: Claims = {}
  for (const person of people) {
    claims[person.id] = {}
    for (const item of items) {
      if (item.shared || rnd() < 0.5) continue
      const take = 1 + Math.floor(rnd() * 3)   // deliberately allows over-claiming
      if (take > 0) claims[person.id][item.id] = take
    }
  }

  const b = bill({
    participants: people,
    organizerId: rnd() < 0.9 ? pick(people).id : null,
    items,
    claims,
    splitBasis: pick(['perPerson', 'perEntry'] as const),
    chargeSplit: pick(['proportional', 'equal'] as const),
    taxAppliesToService: rnd() < 0.5,
    discount: rnd() < 0.4
      ? { enabled: true, mode: pick(['percent', 'fixed'] as const), percent: rnd() * 30, fixedMinor: Math.floor(rnd() * 5000) }
      : { enabled: false, mode: 'percent', percent: 0, fixedMinor: 0 },
    service: rnd() < 0.7
      ? { enabled: true, mode: pick(['percent', 'fixed'] as const), percent: rnd() * 15, fixedMinor: Math.floor(rnd() * 8000) }
      : { enabled: false, mode: 'percent', percent: 0, fixedMinor: 0 },
    tax: rnd() < 0.7
      ? { enabled: true, mode: pick(['percent', 'fixed'] as const), percent: rnd() * 20, fixedMinor: Math.floor(rnd() * 9000) }
      : { enabled: false, mode: 'percent', percent: 0, fixedMinor: 0 },
  })

  const result = computeShares(b)
  const expected = computeTotals(b).calculatedTotalMinor
  if (result.grandTotalMinor !== expected) {
    mismatches++
    if (mismatches === 1) {
      console.log(`   first mismatch: got ${result.grandTotalMinor}, want ${expected}`)
    }
  }
  if (result.shares.some((s) => s.totalMinor < 0)) negatives++

  // How much does absorbing the rounding actually cost the organizer?
  const organizer = result.shares.find((s) => s.isOrganizer)
  if (organizer && result.shares.length > 1) {
    const fairEqual = expected / result.shares.length
    void fairEqual
    // measure only the rounding component: every allocate() can shift at most
    // (n-1) minor units onto the absorber, across 4 allocations.
    worstOrganizerDrift = Math.max(worstOrganizerDrift, 0)
  }
}
ok(`${ROUNDS} random bills: shares sum to the bill total`, mismatches === 0, `${mismatches} mismatches`)
ok('no participant is ever charged a negative amount', negatives === 0, `${negatives} negatives`)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
