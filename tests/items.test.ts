/**
 * Line-total pricing, and splitting one item between named people.
 *
 * Both are places where money can quietly go missing. A line total of 100.00
 * across 3 teas cannot be divided into equal piastres, and a pizza split
 * between 3 people cannot either — so both must go through `allocate` rather
 * than a unit price, or the shares stop adding up to the bill.
 */
import { computeShares } from '../src/lib/shares'
import { computeTotals } from '../src/lib/calc'
import { itemTotalMinor, unitPriceDisplayMinor, sharedGroup } from '../src/lib/items'
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

const P = (id: string, name: string, partySize = 1, treated = false) => ({ id, name, partySize, treated })
const unit = (id: string, price: number, qty = 1): BillItem =>
  ({ id, name: id, priceMinor: price, priceMode: 'unit', quantity: qty, shared: false, sharedWith: null })
const line = (id: string, total: number, qty: number): BillItem =>
  ({ id, name: id, priceMinor: total, priceMode: 'line', quantity: qty, shared: false, sharedWith: null })
const everyone = (id: string, total: number): BillItem =>
  ({ id, name: id, priceMinor: total, priceMode: 'line', quantity: 1, shared: true, sharedWith: null })
const between = (id: string, total: number, ids: string[]): BillItem =>
  ({ id, name: id, priceMinor: total, priceMode: 'line', quantity: 1, shared: true, sharedWith: ids })
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

// ============================ reading a price =============================
console.log('--- unit price vs line total ---')
eq('unit mode multiplies', itemTotalMinor(unit('x', 1500, 3)), 4500)
eq('line mode does not', itemTotalMinor(line('x', 4500, 3)), 4500)
eq('line total of one', itemTotalMinor(line('x', 4500, 1)), 4500)
eq('unit price shown for a line total', unitPriceDisplayMinor(line('x', 4500, 3)), 1500)
// 100.00 over 3 is 33.333 — display rounds, which is why nothing may compute
// with this number.
eq('indivisible line total rounds for display only', unitPriceDisplayMinor(line('x', 10000, 3)), 3333)
eq('and the line total itself is untouched', itemTotalMinor(line('x', 10000, 3)), 10000)
eq('zero quantity does not divide by zero', unitPriceDisplayMinor(line('x', 500, 0)), 500)

// The whole point: a line total that does not divide evenly must not lose money.
const indivisible = computeTotals(bill({ items: [line('tea', 10000, 3)] }))
eq('subtotal is the printed 100.00, not 99.99', indivisible.itemsSubtotalMinor, 10000)

// ============================ claiming a line total =======================
console.log('\n--- claiming part of an indivisible line ---')
const claimed = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar')],
  organizerId: 'a',
  items: [line('tea', 10000, 3)],       // 3 teas, 100.00 the lot
  claims: { a: { tea: 1 }, s: { tea: 1 }, o: { tea: 1 } },
}))
eq('one gets the extra piastre', claimed.shares.map((s) => s.totalMinor), [3334, 3333, 3333])
eq('and the line still costs exactly 100.00', claimed.grandTotalMinor, 10000)
ok('the organizer absorbs the odd piastre', claimed.shares[0].totalMinor === 3334)

// partly claimed: the rest becomes communal, and the two still sum to the line
const partly = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [line('tea', 10000, 3)],
  claims: { a: { tea: 2 } },            // Sara claims nothing; 1 tea unclaimed
}))
eq('unclaimed portion itemised', partly.communal.length, 1)
eq('claimed + unclaimed = the line total',
   partly.shares.reduce((n, s) => n + s.personalMinor, 0) + partly.communalTotalMinor, 10000)
eq('grand total unchanged', partly.grandTotalMinor, 10000)

// ============================ splitting between people ====================
console.log('\n--- one item split between named people ---')
const pizzaBill = bill({
  participants: [P('a', 'Caro', 3), P('s', 'Sara'), P('o', 'Omar')],
  organizerId: 'a',
  items: [between('pizza', 10000, ['a', 's'])],
})
const pizza = computeShares(pizzaBill)
eq('only the two named pay', pizza.shares.map((s) => s.totalMinor), [5000, 5000, 0])
eq('nothing leaks into the communal pool', pizza.communalTotalMinor, 0)
eq('bill still adds up', pizza.grandTotalMinor, 10000)
eq('the line is labelled as split', pizza.shares[0].lines[0].sharedWays, 2)

// Party size must NOT weight an explicitly named group: picking "Caro and
// Sara" means half each, not three-quarters to Caro's family of three.
ok('a named split ignores party size', pizza.shares[0].totalMinor === pizza.shares[1].totalMinor)

// three-way split of an amount that does not divide
const threeWay = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar')],
  organizerId: 'a',
  items: [between('pizza', 10000, ['a', 's', 'o'])],
}))
eq('33.34 / 33.33 / 33.33', threeWay.shares.map((s) => s.totalMinor), [3334, 3333, 3333])
eq('and it sums exactly', threeWay.grandTotalMinor, 10000)

// a group of one is just that person paying
const solo = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [between('cake', 5000, ['s'])],
}))
eq('a one-person group pays it all', solo.shares.map((s) => s.totalMinor), [0, 5000])

// ============================ degenerate groups ===========================
console.log('\n--- groups that no longer make sense ---')
const ghost = bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [between('pizza', 10000, ['deleted-person'])],
})
eq('a group of people who all left resolves to nobody', sharedGroup(ghost.items[0], ghost.participants), [])
const ghostResult = computeShares(ghost)
eq('...so it falls back to the whole table', ghostResult.communalTotalMinor, 10000)
eq('...and no money vanishes', ghostResult.grandTotalMinor, 10000)

const partlyGone = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [between('pizza', 10000, ['a', 'gone'])],
}))
eq('a departed member just shrinks the group', partlyGone.shares.map((s) => s.totalMinor), [10000, 0])

// empty sharedWith array behaves like "everyone"
const emptyGroup = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara')],
  organizerId: 'a',
  items: [{ ...everyone('bread', 6000), sharedWith: [] }],
}))
eq('empty group means everyone', emptyGroup.shares.map((s) => s.totalMinor), [3000, 3000])

// ============================ everything at once ==========================
console.log('\n--- mixed bill ---')
const mixed = computeShares(bill({
  participants: [P('a', 'Caro', 2), P('s', 'Sara'), P('o', 'Omar')],
  organizerId: 'a',
  items: [
    unit('steak', 25000),               // claimed by Omar
    line('tea', 10000, 3),              // one each
    between('pizza', 7000, ['a', 's']),  // Caro + Sara
    everyone('bread', 4000),            // whole table
  ],
  claims: { o: { steak: 1 }, a: { tea: 1 }, s: { tea: 1 } },
  service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 },
}))
eq('mixed bill reconciles exactly',
   mixed.grandTotalMinor, mixed.totals.calculatedTotalMinor + mixed.tipsTotalMinor)
ok('nobody is charged a negative amount', mixed.shares.every((s) => s.totalMinor >= 0))

// ============================ fuzz ========================================
console.log('\n--- fuzz: price modes and named splits keep the bill exact ---')
let seed = 13579
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]

let mismatches = 0, negatives = 0
const ROUNDS = 5000

for (let round = 0; round < ROUNDS; round++) {
  const people = Array.from({ length: 1 + Math.floor(rnd() * 5) },
    (_, i) => P(`p${i}`, `P${i}`, 1 + Math.floor(rnd() * 3)))
  const ids = people.map((p) => p.id)

  const items: BillItem[] = Array.from({ length: 1 + Math.floor(rnd() * 6) }, (_, i) => {
    const id = `i${i}`
    const price = 1 + Math.floor(rnd() * 30000)
    const qty = 1 + Math.floor(rnd() * 4)
    const roll = rnd()
    if (roll < 0.2) return everyone(id, price)
    if (roll < 0.45) {
      // A named group, sometimes including ids that do not exist.
      const group = ids.filter(() => rnd() < 0.5)
      if (rnd() < 0.2) group.push('ghost')
      return between(id, price, group)
    }
    if (roll < 0.72) return line(id, price, qty)
    return unit(id, price, qty)
  })

  const claims: Record<string, Record<string, number>> = {}
  for (const p of people) {
    claims[p.id] = {}
    for (const it of items) {
      if (it.shared || rnd() < 0.5) continue
      claims[p.id][it.id] = 1 + Math.floor(rnd() * 3)
    }
  }

  const chance = () => rnd() < 0.6
    ? { enabled: true, mode: pick(['percent','fixed'] as const), percent: rnd()*20, fixedMinor: Math.floor(rnd()*5000) }
    : off

  const b = bill({
    participants: people, organizerId: rnd() < 0.9 ? pick(ids) : null,
    items, claims,
    splitBasis: pick(['perPerson','perEntry'] as const),
    chargeSplit: pick(['proportional','equal'] as const),
    roundUpTo: pick([0, 1, 5]),
    discount: chance(), service: chance(), tax: chance(), tips: chance(),
  })

  const r = computeShares(b)
  if (r.grandTotalMinor !== r.totals.calculatedTotalMinor + r.tipsTotalMinor) mismatches++
  if (r.shares.some((s) => s.totalMinor < 0)) negatives++
}

ok(`${ROUNDS} random bills mixing both price modes and named splits`, mismatches === 0, `${mismatches} bad`)
ok('no negative charges', negatives === 0, `${negatives} bad`)

// ============================ guest of honour =============================
// A treated participant pays nothing, and everything that would have been
// theirs falls to the others. The bill total must not move.
console.log('\n--- guest of honour ---')

const birthday = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar', 1, true)],
  organizerId: 'a',
  items: [unit('cake', 9000), unit('tea', 3000, 2)],
  claims: { o: { cake: 1 }, a: { tea: 1 }, s: { tea: 1 } },
}))
eq('the guest pays nothing', birthday.shares[2].totalMinor, 0)
eq('the guest is flagged', birthday.shares.map((s) => s.isTreated), [false, false, true])
eq('their cake is covered by the others',
   birthday.shares[0].totalMinor + birthday.shares[1].totalMinor, 15000)
eq('bill total unchanged', birthday.grandTotalMinor, 15000)
eq('the guest still sees what they had', birthday.shares[2].lines[0].name, 'cake')
eq('...priced at zero', birthday.shares[2].lines[0].amountMinor, 0)

// service and tax must skip them too
const withCharges = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar', 1, true)],
  organizerId: 'a',
  items: [unit('food', 30000)],
  claims: { a: { food: 1 } },
  service: { enabled: true, mode: 'percent', percent: 10, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 10, fixedMinor: 0 },
  chargeSplit: 'equal',
}))
eq('a guest pays no service', withCharges.shares[2].serviceMinor, 0)
eq('a guest pays no tax', withCharges.shares[2].taxMinor, 0)
eq('a guest owes nothing at all', withCharges.shares[2].totalMinor, 0)
eq('and the bill is still fully covered',
   withCharges.grandTotalMinor, withCharges.totals.calculatedTotalMinor)

// shared items skip them as well
const sharedWithGuest = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar', 1, true)],
  organizerId: 'a',
  items: [everyone('mezze', 9000)],
}))
eq('a guest takes no share of the mezze', sharedWithGuest.shares.map((s) => s.totalMinor), [4500, 4500, 0])

// a named split that includes a guest: the payers cover it
const splitWithGuest = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar', 1, true)],
  organizerId: 'a',
  items: [between('pizza', 9000, ['s', 'o'])],
}))
eq('the paying member of the pair covers it', splitWithGuest.shares.map((s) => s.totalMinor), [0, 9000, 0])
eq('nothing lost', splitWithGuest.grandTotalMinor, 9000)

// a named split where EVERY member is a guest falls back to the whole table
const allGuestsSplit = computeShares(bill({
  participants: [P('a', 'Caro'), P('s', 'Sara'), P('o', 'Omar', 1, true)],
  organizerId: 'a',
  items: [between('pizza', 9000, ['o'])],
}))
eq('an all-guest group falls back to the payers',
   allGuestsSplit.shares.map((s) => s.totalMinor), [4500, 4500, 0])
eq('...still exact', allGuestsSplit.grandTotalMinor, 9000)

// the safety valve: if EVERYONE is a guest, the flag is ignored
const allTreated = computeShares(bill({
  participants: [P('a', 'Caro', 1, true), P('s', 'Sara', 1, true)],
  organizerId: 'a',
  items: [unit('food', 10000)],
  claims: { a: { food: 1 } },
}))
eq('somebody still has to pay the restaurant', allTreated.grandTotalMinor, 10000)
ok('nobody is treated when everyone is', allTreated.shares.every((s) => !s.isTreated))

// rounding must not charge a guest
const guestRounding = computeShares(bill({
  participants: [P('a', 'Caro'), P('o', 'Omar', 1, true)],
  organizerId: 'a',
  items: [unit('food', 1234)],
  claims: { a: { food: 1 } },
  roundUpTo: 5,
}))
eq('a guest is not rounded up to 5', guestRounding.shares[1].totalMinor, 0)
eq('the payer is', guestRounding.shares[0].totalMinor, 1500)

// ============================ fuzz, with guests ===========================
console.log('\n--- fuzz: guests never break the total ---')
let gseed = 24680
const grnd = () => { gseed = (gseed * 1103515245 + 12345) & 0x7fffffff; return gseed / 0x7fffffff }
const gpick = <T,>(a: T[]) => a[Math.floor(grnd() * a.length)]

let gMismatch = 0, guestPaid = 0, gNegative = 0

for (let round = 0; round < 4000; round++) {
  const people = Array.from({ length: 1 + Math.floor(grnd() * 5) },
    (_, i) => P(`p${i}`, `P${i}`, 1 + Math.floor(grnd() * 3), grnd() < 0.3))
  const ids = people.map((p) => p.id)
  const items: BillItem[] = Array.from({ length: 1 + Math.floor(grnd() * 5) }, (_, i) => {
    const id = `i${i}`
    const price = 1 + Math.floor(grnd() * 20000)
    const qty = 1 + Math.floor(grnd() * 3)
    const roll = grnd()
    if (roll < 0.2) return everyone(id, price)
    if (roll < 0.4) return between(id, price, ids.filter(() => grnd() < 0.5))
    if (roll < 0.7) return line(id, price, qty)
    return unit(id, price, qty)
  })
  const claims: Record<string, Record<string, number>> = {}
  for (const p of people) {
    claims[p.id] = {}
    for (const it of items) {
      if (it.shared || grnd() < 0.5) continue
      claims[p.id][it.id] = 1 + Math.floor(grnd() * 2)
    }
  }
  const chance = () => grnd() < 0.6
    ? { enabled: true, mode: gpick(['percent','fixed'] as const), percent: grnd()*20, fixedMinor: Math.floor(grnd()*4000) }
    : off

  const b = bill({
    participants: people, organizerId: grnd() < 0.9 ? gpick(ids) : null,
    items, claims,
    splitBasis: gpick(['perPerson','perEntry'] as const),
    chargeSplit: gpick(['proportional','equal'] as const),
    roundUpTo: gpick([0, 1, 5]),
    discount: chance(), service: chance(), tax: chance(), tips: chance(),
  })

  const r = computeShares(b)
  if (r.grandTotalMinor !== r.totals.calculatedTotalMinor + r.tipsTotalMinor) gMismatch++
  if (r.shares.some((s) => s.isTreated && s.totalMinor !== 0)) guestPaid++
  if (r.shares.some((s) => s.totalMinor < 0)) gNegative++
}

ok('4,000 bills with guests still reconcile exactly', gMismatch === 0, `${gMismatch} bad`)
ok('a guest of honour is never charged', guestPaid === 0, `${guestPaid} bad`)
ok('no negative charges', gNegative === 0, `${gNegative} bad`)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
