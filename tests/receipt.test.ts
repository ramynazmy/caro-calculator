/**
 * The model's output is the only input to this app we do not control. It can
 * be the right shape with nonsense in it, the wrong shape entirely, or a
 * plausible string where a number belongs. Everything here treats it as
 * hostile — the bar is "never corrupts the bill", not "always extracts".
 */
import { mapScannedReceipt, draftItemsTotalMinor } from '../src/lib/receipt'

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

const map = (raw: unknown, currency = 'EGP') => mapScannedReceipt(raw, currency)

// ============================ the happy path ==============================
console.log('--- a clean read ---')
const good = map({
  items: [
    { name: 'Chicken shawarma', price: 120.5, quantity: 2, confidence: 0.97 },
    { name: 'شاي', price: 15, quantity: 3, confidence: 0.9 },
  ],
  servicePercent: 12,
  taxPercent: 14,
  printedTotal: 371.28,
  currencyCode: 'EGP',
})
eq('two items kept', good.items.length, 2)
eq('price -> integer piastres', good.items[0].priceMinor, 12050)
eq('quantity preserved', good.items[0].quantity, 2)
eq('Arabic name kept verbatim', good.items[1].name, 'شاي')
eq('nothing dropped', good.droppedItems, 0)
eq('items are never auto-shared', good.items.every((i) => !i.shared), true)
eq('service read as a percentage', [good.service?.mode, good.service?.percent], ['percent', 12])
eq('tax read as a percentage', [good.tax?.mode, good.tax?.percent], ['percent', 14])
eq('printed total -> minor units', good.actualTotalMinor, 37128)
eq('currency accepted', good.currency, 'EGP')
eq('items total', draftItemsTotalMinor(good), 12050 * 2 + 1500 * 3)
ok('every item gets a unique id', new Set(good.items.map((i) => i.id)).size === 2)

// ============================ malformed input =============================
console.log('\n--- when the model returns rubbish ---')
for (const [label, input] of [
  ['null', null],
  ['undefined', undefined],
  ['a string', 'sorry, I could not read that'],
  ['a number', 42],
  ['an empty object', {}],
  ['items is not an array', { items: 'Chicken' }],
  ['items is null', { items: null }],
] as const) {
  const r = map(input)
  ok(`${label} -> empty draft, no crash`, r.items.length === 0 && r.actualTotalMinor === null)
}

// ============================ bad rows are dropped ========================
console.log('\n--- individual bad rows ---')
const messy = map({
  items: [
    { name: 'Good', price: 10, quantity: 1, confidence: 1 },
    { name: '', price: 10 },                       // no name
    { name: '   ', price: 10 },                    // whitespace name
    { name: 'No price' },                              // no price
    { name: 'Null price', price: null },
    { name: 'Text price', price: 'free' },
    { name: 'Negative', price: -50 },
    { name: 'Absurd', price: 99_999_999 },         // misread barcode/phone
    { name: 'NaN', price: Number.NaN },
    { name: 'Infinite', price: Number.POSITIVE_INFINITY },
    null,
    'not an object',
  ],
})
eq('only the good row survives', messy.items.length, 1)
eq('and the rest are counted', messy.droppedItems, 11)
eq('survivor is intact', [messy.items[0].name, messy.items[0].priceMinor], ['Good', 1000])

// ============================ coercion ====================================
console.log('\n--- values that need cleaning up ---')
const coerced = map({
  items: [
    { name: '  Spaced  ', price: '12.50', quantity: '3' },
    { name: 'Symbols', price: '1,234.50 EGP', quantity: 1 },
    { name: 'Zero qty', price: 10, quantity: 0 },
    { name: 'Negative qty', price: 10, quantity: -5 },
    { name: 'Fractional qty', price: 10, quantity: 2.6 },
    { name: 'Silly qty', price: 10, quantity: 100000 },
    { name: 'Free item', price: 0, quantity: 1 },
  ],
})
eq('name trimmed', coerced.items[0].name, 'Spaced')
eq('numeric string price', coerced.items[0].priceMinor, 1250)
eq('numeric string quantity', coerced.items[0].quantity, 3)
eq('price with symbols and separators', coerced.items[1].priceMinor, 123450)
eq('quantity 0 -> 1', coerced.items[2].quantity, 1)
eq('negative quantity -> 1', coerced.items[3].quantity, 1)
eq('fractional quantity rounded', coerced.items[4].quantity, 3)
eq('absurd quantity -> 1', coerced.items[5].quantity, 1)
eq('a genuinely free item is kept', coerced.items[6].priceMinor, 0)

const conf = map({
  items: [
    { name: 'A', price: 1, confidence: 0.3 },
    { name: 'B', price: 1, confidence: 5 },
    { name: 'C', price: 1, confidence: -2 },
    { name: 'D', price: 1 },
    { name: 'E', price: 1, confidence: 'high' },
  ],
})
eq('confidence clamped to 0..1', conf.items.map((i) => i.confidence), [0.3, 1, 0, 0.5, 0.5])

// A very long name would break the layout; it is capped, not dropped.
const long = map({ items: [{ name: 'x'.repeat(500), price: 1 }] })
ok('absurdly long name capped', long.items[0].name.length <= 80)

// ============================ charges =====================================
console.log('\n--- service, tax, discount ---')
const both = map({ items: [], serviceAmount: 24, servicePercent: 12 })
eq('a printed amount beats an inferred percentage', both.service?.mode, 'fixed')
eq('...converted to minor units', both.service?.fixedMinor, 2400)

eq('zero amount is not a charge', map({ items: [], serviceAmount: 0 }).service, null)
eq('zero percent is not a charge', map({ items: [], servicePercent: 0 }).service, null)
eq('negative percent rejected', map({ items: [], taxPercent: -5 }).tax, null)
eq('percent over 100 rejected', map({ items: [], taxPercent: 150 }).tax, null)
eq('missing charges stay null', [map({ items: [] }).service, map({ items: [] }).tax], [null, null])
eq('discount amount', map({ items: [], discountAmount: 30 }).discount?.fixedMinor, 3000)
// The percent field carries the Egyptian default so the mode toggle is useful.
eq('fixed charge keeps a sensible fallback percent', both.service?.percent, 12)

// ============================ currency ====================================
console.log('\n--- currency and decimal places ---')
eq('unsupported code ignored', map({ items: [], currencyCode: 'XYZ' }).currency, null)
eq('lowercase code accepted', map({ items: [], currencyCode: 'usd' }).currency, 'USD')
eq('missing code -> null', map({ items: [] }).currency, null)
eq('non-string code -> null', map({ items: [], currencyCode: 42 }).currency, null)
// KWD has three decimal places, so the same figure is a different integer.
eq('12.5 in EGP', map({ items: [{ name: 'x', price: 12.5 }] }, 'EGP').items[0].priceMinor, 1250)
eq('12.5 in KWD', map({ items: [{ name: 'x', price: 12.5 }] }, 'KWD').items[0].priceMinor, 12500)

// ============================ scale =======================================
console.log('\n--- absurdly long output ---')
const huge = map({
  items: Array.from({ length: 500 }, (_, i) => ({ name: `Item ${i}`, price: 10 })),
})
eq('capped at 200 rows', huge.items.length, 200)
eq('the overflow is reported, not hidden', huge.droppedItems, 300)

// ============================ the safety property =========================
// Whatever comes back, the draft must be structurally usable: every item has
// a name, a non-negative integer price, and a quantity of at least 1.
console.log('\n--- fuzz: never produce a corrupt item ---')
let seed = 2468
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const junk = () => {
  const pool: unknown[] = [
    undefined, null, '', '  ', 'abc', '12.5', '-3', 'NaN', 0, -1, 1e12, Number.NaN,
    Number.POSITIVE_INFINITY, 3.7, true, false, {}, [], { name: 1 }, 'ج.م ١٢',
  ]
  return pool[Math.floor(rnd() * pool.length)]
}

let bad = 0
for (let i = 0; i < 3000; i++) {
  const draft = map({
    items: Array.from({ length: Math.floor(rnd() * 6) }, () => ({
      name: junk(), price: junk(), quantity: junk(), confidence: junk(),
    })),
    serviceAmount: junk(), servicePercent: junk(),
    taxAmount: junk(), taxPercent: junk(),
    discountAmount: junk(), printedTotal: junk(), currencyCode: junk(),
  })
  for (const item of draft.items) {
    if (
      typeof item.name !== 'string' || item.name.length === 0 ||
      !Number.isInteger(item.priceMinor) || item.priceMinor < 0 ||
      !Number.isInteger(item.quantity) || item.quantity < 1 ||
      item.confidence < 0 || item.confidence > 1
    ) bad++
  }
  if (draft.actualTotalMinor !== null && !Number.isInteger(draft.actualTotalMinor)) bad++
  for (const c of [draft.service, draft.tax, draft.discount]) {
    if (c && (!Number.isInteger(c.fixedMinor) || c.fixedMinor < 0)) bad++
  }
}
ok('3,000 rounds of garbage produce no corrupt item', bad === 0, `${bad} bad`)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
