import { computeShares } from '../src/lib/shares'
import { computeTotals, ceilToMultiple, roundUpStepMinor } from '../src/lib/calc'
import type { Bill, BillItem } from '../src/types'

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

const P = (id: string, name: string, partySize = 1) => ({ id, name, partySize })
const I = (id: string, price: number, qty = 1, shared = false): BillItem =>
  ({ id, name: id, unitPriceMinor: price, quantity: qty, shared })
const off = { enabled: false, mode: 'percent' as const, percent: 0, fixedMinor: 0 }

function bill(over: Partial<Bill> = {}): Bill {
  return {
    version: 4, id: 'b', title: 'T', currency: 'EGP', createdAt: 0,
    items: [], taxAppliesToService: true, actualTotalMinor: null,
    discount: off, service: off, tax: off, tips: off, roundUpTo: 0,
    participants: [], organizerId: null, splitBasis: 'perPerson',
    chargeSplit: 'proportional', claims: {}, locked: false,
    respondedAt: {}, published: false,
    ...over,
  }
}

// ============================ ceilToMultiple ==============================
console.log('--- rounding up to a multiple ---')
eq('12.34 -> 15.00 (step 5)', ceilToMultiple(1234, 500), 1500)
eq('15.00 stays 15.00 (already a multiple)', ceilToMultiple(1500, 500), 1500)
eq('15.01 -> 20.00', ceilToMultiple(1501, 500), 2000)
eq('0 stays 0 — nobody is charged for eating nothing', ceilToMultiple(0, 500), 0)
eq('step 0 disables rounding', ceilToMultiple(1234, 0), 1234)
eq('step 1 EGP', ceilToMultiple(1234, 100), 1300)

// The step is derived from the currency, so 5 means 5 of whatever it is.
eq('5 EGP = 500 piastres', roundUpStepMinor(bill({ roundUpTo: 5 })), 500)
eq('5 KWD = 5000 fils (3 decimals)', roundUpStepMinor(bill({ currency: 'KWD', roundUpTo: 5 })), 5000)
eq('roundUpTo 0 -> step 0', roundUpStepMinor(bill({ roundUpTo: 0 })), 0)

// ============================ the tip is not the bill =====================
console.log('\n--- a tip must not break the receipt cross-check ---')
const tipped = bill({
  items: [I('food', 20000)],
  service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 },
  tips: { enabled: true, mode: 'percent', percent: 10, fixedMinor: 0 },
  actualTotalMinor: 25536,          // what the restaurant actually printed
})
const tt = computeTotals(tipped)
eq('printed-bill total excludes the tip', tt.calculatedTotalMinor, 25536)
eq('receipt still matches', tt.hasMismatch, false)
eq('tip is 10% of food, not of the taxed total', tt.tipsMinor, 2000)
eq('payable = bill + tip', tt.payableTotalMinor, 27536)

// fixed-amount tip
const fixedTip = computeTotals(bill({
  items: [I('food', 20000)],
  tips: { enabled: true, mode: 'fixed', percent: 0, fixedMinor: 3000 },
}))
eq('fixed tip', fixedTip.tipsMinor, 3000)
eq('fixed tip does not touch the bill total', fixedTip.calculatedTotalMinor, 20000)

// discount applies before the tip percentage
const discTip = computeTotals(bill({
  items: [I('food', 20000)],
  discount: { enabled: true, mode: 'percent', percent: 50, fixedMinor: 0 },
  tips: { enabled: true, mode: 'percent', percent: 10, fixedMinor: 0 },
}))
eq('tip is on the discounted food', discTip.tipsMinor, 1000)

// ============================ distribution ================================
console.log('\n--- the tip is split like service and tax ---')
const split = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('big', 30000), I('small', 10000)],
  claims: { a: { big: 1 }, s: { small: 1 } },
  tips: { enabled: true, mode: 'fixed', percent: 0, fixedMinor: 4000 },
})
const rProp = computeShares(split)
eq('proportional tip 3:1', [rProp.shares[0].tipsMinor, rProp.shares[1].tipsMinor], [3000, 1000])
const rEqual = computeShares({ ...split, chargeSplit: 'equal' })
eq('equal tip', [rEqual.shares[0].tipsMinor, rEqual.shares[1].tipsMinor], [2000, 2000])
eq('either way the total tip is the same', rEqual.tipsTotalMinor, rProp.tipsTotalMinor)

// ============================ round-up feeds the tip ======================
console.log('\n--- rounding up, and where the money goes ---')
const rounded = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar')],
  organizerId: 'a',
  items: [I('x', 3333, 3)],                    // 99.99, split three ways
  claims: { a: { x: 1 }, s: { x: 1 }, o: { x: 1 } },
  roundUpTo: 5,
}))
eq('everyone pays a whole multiple of 5', rounded.shares.map((s) => s.totalMinor), [3500, 3500, 3500])
eq('each was rounded up from 33.33', rounded.shares.map((s) => s.subtotalMinor), [3333, 3333, 3333])
eq('round-up per person', rounded.shares.map((s) => s.roundUpMinor), [167, 167, 167])
eq('round-up collected', rounded.roundUpTotalMinor, 501)
eq('all of it became tip', rounded.tipsTotalMinor, 501)
eq('grand total', rounded.grandTotalMinor, 10500)
eq('the restaurant still gets exactly the bill',
   rounded.grandTotalMinor - rounded.tipsTotalMinor, rounded.totals.calculatedTotalMinor)

// explicit tip AND round-up together
const both = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('x', 10000, 2)],
  claims: { a: { x: 1 }, s: { x: 1 } },
  tips: { enabled: true, mode: 'fixed', percent: 0, fixedMinor: 1234 },
  roundUpTo: 5,
}))
eq('tips = explicit + rounding', both.tipsTotalMinor, both.totals.tipsMinor + both.roundUpTotalMinor)
eq('bill untouched by either', both.totals.calculatedTotalMinor, 20000)
eq('shares are whole multiples of 5', both.shares.every((s) => s.totalMinor % 500 === 0), true)

// somebody who owes nothing is not charged 5 EGP for the privilege
const freeloader = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [I('x', 10000)],
  claims: { a: { x: 1 } },
  splitBasis: 'perPerson',
  roundUpTo: 5,
}))
const sara = freeloader.shares[1]
ok('a zero share stays zero', sara.totalMinor === 0 || sara.subtotalMinor > 0,
   `subtotal ${sara.subtotalMinor}, total ${sara.totalMinor}`)

// rounding off means exact shares, as before
const noRound = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar')],
  organizerId: 'a',
  items: [I('x', 3333, 3)],
  claims: { a: { x: 1 }, s: { x: 1 }, o: { x: 1 } },
  roundUpTo: 0,
}))
eq('no rounding -> exact bill', noRound.grandTotalMinor, 9999)
eq('no rounding -> no tip', noRound.tipsTotalMinor, 0)

// ============================ THE INVARIANT, EXTENDED =====================
console.log('\n--- fuzz: bill + tip must always equal what people hand over ---')
let seed = 987654
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]

let mismatches = 0, notMultiple = 0, negatives = 0, underpaid = 0
const ROUNDS = 5000

for (let round = 0; round < ROUNDS; round++) {
  const people = Array.from({ length: 1 + Math.floor(rnd() * 6) },
    (_, i) => P(`p${i}`, `P${i}`, 1 + Math.floor(rnd() * 4)))
  const items = Array.from({ length: 1 + Math.floor(rnd() * 6) },
    (_, i) => I(`i${i}`, 1 + Math.floor(rnd() * 40000), 1 + Math.floor(rnd() * 4), rnd() < 0.25))
  const claims: Record<string, Record<string, number>> = {}
  for (const p of people) {
    claims[p.id] = {}
    for (const it of items) {
      if (it.shared || rnd() < 0.5) continue
      claims[p.id][it.id] = 1 + Math.floor(rnd() * 3)
    }
  }
  const chance = (p: number, c: Partial<Bill['tips']> = {}) => rnd() < p
    ? { enabled: true, mode: pick(['percent','fixed'] as const), percent: rnd()*20, fixedMinor: Math.floor(rnd()*6000), ...c }
    : off

  const roundUpTo = pick([0, 1, 5, 10])
  const b = bill({
    participants: people, organizerId: rnd() < 0.9 ? pick(people).id : null,
    items, claims, roundUpTo,
    splitBasis: pick(['perPerson','perEntry'] as const),
    chargeSplit: pick(['proportional','equal'] as const),
    taxAppliesToService: rnd() < 0.5,
    discount: chance(0.4), service: chance(0.7), tax: chance(0.7), tips: chance(0.5),
  })

  const r = computeShares(b)
  const step = roundUpStepMinor(b)

  // 1. What everyone hands over covers the bill and the tip, exactly.
  if (r.grandTotalMinor !== r.totals.calculatedTotalMinor + r.tipsTotalMinor) mismatches++
  // 2. The restaurant is never short-changed.
  if (r.grandTotalMinor < r.totals.calculatedTotalMinor) underpaid++
  // 3. Every non-zero share really is a whole multiple.
  if (step > 0 && r.shares.some((s) => s.totalMinor > 0 && s.totalMinor % step !== 0)) notMultiple++
  // 4. Nobody is charged a negative amount, or rounded *down*.
  if (r.shares.some((s) => s.totalMinor < 0 || s.roundUpMinor < 0)) negatives++
}

ok(`${ROUNDS} random bills: handed over === bill + tip`, mismatches === 0, `${mismatches} bad`)
ok('the restaurant is never short-changed', underpaid === 0, `${underpaid} bad`)
ok('every non-zero share is a whole multiple of the step', notMultiple === 0, `${notMultiple} bad`)
ok('no negative charges, no rounding down', negatives === 0, `${negatives} bad`)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
