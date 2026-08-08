import { computeTotals, serviceToMatchActual } from '../src/lib/calc'
import { parseToMinor, formatAmount } from '../src/lib/money'
import type { Bill } from '../src/types'

let failed = 0
function eq(label: string, got: unknown, want: unknown) {
  const ok = got === want
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got ${got}${ok ? '' : `, want ${want}`}`)
}

function bill(over: Partial<Bill> = {}): Bill {
  return {
    version: 6, id: 'x', title: '', currency: 'EGP', createdAt: 0,
    items: [], participants: [], actualTotalMinor: null, taxAppliesToService: true,
    organizerId: null, splitBasis: 'perPerson', chargeSplit: 'proportional',
    claims: {}, locked: false, respondedAt: {}, published: false,
    discount: { enabled: false, mode: 'percent', percent: 0, fixedMinor: 0 },
    service: { enabled: false, mode: 'percent', percent: 12, fixedMinor: 0 },
    tax: { enabled: false, mode: 'percent', percent: 14, fixedMinor: 0 },
    tips: { enabled: false, mode: 'percent', percent: 10, fixedMinor: 0 }, roundUpTo: 0,
    ...over,
  }
}
const item = (price: number, qty = 1) =>
  ({ id: Math.random().toString(36).slice(2), name: 'x', priceMinor: price, priceMode: 'unit' as const, quantity: qty, shared: false, sharedWith: null })

// --- parsing ---------------------------------------------------------------
eq('parse "12.50" EGP', parseToMinor('12.50', 'EGP'), 1250)
eq('parse "1,234.5" EGP', parseToMinor('1,234.5', 'EGP'), 123450)
eq('parse arabic "١٢٫٥٠"', parseToMinor('١٢٫٥٠', 'EGP'), 1250)
eq('parse "12.5" KWD (3dp)', parseToMinor('12.5', 'KWD'), 12500)
eq('parse "" -> null', parseToMinor('', 'EGP'), null)
eq('parse "abc" -> null', parseToMinor('abc', 'EGP'), null)
eq('format 123450', formatAmount(123450, 'EGP'), '1,234.50')

// --- float-safety: 0.1 + 0.2 style trap -------------------------------------
const cents = bill({ items: [item(10), item(20)] })
eq('0.10 + 0.20 = 0.30 exactly', computeTotals(cents).itemsSubtotalMinor, 30)

// --- Egyptian receipt: 200.00 food, 12% service, 14% VAT on food+service ----
const eg = bill({
  items: [item(10000, 2)],
  service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 },
})
const egT = computeTotals(eg)
eq('EG subtotal', egT.itemsSubtotalMinor, 20000)
eq('EG service 12%', egT.serviceMinor, 2400)          // 200.00 * .12 = 24.00
eq('EG tax 14% on 224', egT.taxMinor, 3136)           // 224.00 * .14 = 31.36
eq('EG total', egT.calculatedTotalMinor, 25536)       // 255.36

// tax NOT on service
const egNoCompound = computeTotals({ ...eg, taxAppliesToService: false })
eq('EG tax 14% on 200 only', egNoCompound.taxMinor, 2800)
eq('EG total no-compound', egNoCompound.calculatedTotalMinor, 25200)

// --- discount ---------------------------------------------------------------
const disc = bill({
  items: [item(10000, 2)],
  discount: { enabled: true, mode: 'percent', percent: 10, fixedMinor: 0 },
  service: { enabled: true, mode: 'percent', percent: 12, fixedMinor: 0 },
  tax: { enabled: true, mode: 'percent', percent: 14, fixedMinor: 0 },
})
const dT = computeTotals(disc)
eq('discount 10% of 200', dT.discountMinor, 2000)
eq('net after discount', dT.netSubtotalMinor, 18000)
eq('service on net', dT.serviceMinor, 2160)
eq('tax on 201.60', dT.taxMinor, 2822)                // 201.60*.14 = 28.224 -> 28.22
eq('total w/ discount', dT.calculatedTotalMinor, 22982)

// discount can't exceed subtotal
const over = computeTotals(bill({ items: [item(5000)], discount: { enabled: true, mode: 'fixed', percent: 0, fixedMinor: 999999 } }))
eq('discount capped at subtotal', over.calculatedTotalMinor, 0)

// --- receipt mismatch -------------------------------------------------------
const mm = { ...eg, actualTotalMinor: 25600 }
const mmT = computeTotals(mm)
eq('mismatch detected', mmT.hasMismatch, true)
eq('difference = +0.64', mmT.differenceMinor, 64)

// "adjust service to match": solve 25600 = (200 + S) * 1.14
const fix = serviceToMatchActual(mm)
eq('suggested service', fix, 2456)                    // 25600/1.14 - 20000 = 2456.14 -> 2456
const fixed = computeTotals({ ...mm, service: { enabled: true, mode: 'fixed', percent: 12, fixedMinor: fix! } })
eq('after fix, total matches receipt', fixed.calculatedTotalMinor, 25600)
eq('after fix, no mismatch', fixed.hasMismatch, false)

// no-tax variant
const noTax = { ...bill({ items: [item(10000)] }), actualTotalMinor: 11500 }
eq('suggested service, no tax', serviceToMatchActual(noTax), 1500)

// impossible fix (receipt lower than food alone)
const impossible = { ...bill({ items: [item(10000)] }), actualTotalMinor: 5000 }
eq('impossible fix -> null', serviceToMatchActual(impossible), null)

console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`)
