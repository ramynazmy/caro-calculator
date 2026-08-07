/**
 * Turning what the model said into something the bill can use.
 *
 * Kept deliberately free of any network or Firebase code so it can be tested
 * against recorded fixtures — which matters more here than anywhere else in
 * the app, because this is the one input we do not control. A language model
 * can return the right shape with nonsense in it, the wrong shape entirely, or
 * a plausible-looking string where a number belongs. Everything below assumes
 * the input is hostile and keeps only what it can verify.
 */

import type { BillItem, Charge } from '../types'
import { getCurrency, CURRENCIES } from './currencies'
import { newId } from './id'

/** The shape we ask the model for. Every field is optional in practice. */
export interface ScannedReceipt {
  items?: Array<{
    name?: unknown
    unitPrice?: unknown
    quantity?: unknown
    confidence?: unknown
  }>
  serviceAmount?: unknown
  servicePercent?: unknown
  taxAmount?: unknown
  taxPercent?: unknown
  discountAmount?: unknown
  printedTotal?: unknown
  currencyCode?: unknown
}

export interface DraftItem extends BillItem {
  /** The model's own confidence, 0–1. Used to flag rows worth checking. */
  confidence: number
}

export interface ReceiptDraft {
  items: DraftItem[]
  service: Charge | null
  tax: Charge | null
  discount: Charge | null
  /** The total printed on the receipt, which drives the existing cross-check. */
  actualTotalMinor: number | null
  /** Only set when the model named a currency we actually support. */
  currency: string | null
  /** Rows that were thrown away, so the UI can admit something was dropped. */
  droppedItems: number
}

/**
 * Sanity ceiling. A single line on a restaurant bill is not a million pounds;
 * a number that large is a misread (a phone number, a date, a barcode) rather
 * than a price, and letting it through would wreck the totals silently.
 */
const MAX_REASONABLE_MAJOR = 1_000_000
const MAX_ITEMS = 200

/**
 * Strip currency symbols and separators from a numeric string.
 *
 * Returns null rather than a number when nothing numeric is left. This matters:
 * `Number('')` is `0`, so a model answering "free" or "N/A" for a price would
 * otherwise sail through as a legitimate zero-cost item instead of being
 * flagged as unreadable.
 */
function cleanNumericString(value: string): number | null {
  const cleaned = value.replace(/[^\d.-]/g, '')
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** A finite, non-negative, believable number — or null. */
function money(value: unknown): number | null {
  const n = typeof value === 'string' ? cleanNumericString(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  if (n < 0 || n > MAX_REASONABLE_MAJOR) return null
  return n
}

function toMinor(major: number, currency: string): number {
  return Math.round(major * 10 ** getCurrency(currency).decimals)
}

function percent(value: unknown): number | null {
  const n = typeof value === 'string' ? cleanNumericString(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  // A "percentage" outside this range is a misread, not a tax rate.
  if (n <= 0 || n > 100) return null
  return n
}

function quantity(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1
  const rounded = Math.round(n)
  // Quantities are whole and small. Anything else is a misread column.
  return rounded >= 1 && rounded <= 999 ? rounded : 1
}

function confidence(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 0.5
  return Math.min(1, Math.max(0, n))
}

/**
 * Build a charge from whichever of amount-or-percentage the model found.
 * A concrete amount is preferred: it is copied straight off the receipt,
 * whereas a percentage has usually been inferred.
 */
function charge(
  amount: unknown,
  pct: unknown,
  currency: string,
  fallbackPercent: number,
): Charge | null {
  const fixed = money(amount)
  if (fixed !== null && fixed > 0) {
    return {
      enabled: true,
      mode: 'fixed',
      percent: fallbackPercent,
      fixedMinor: toMinor(fixed, currency),
    }
  }
  const rate = percent(pct)
  if (rate !== null) {
    return { enabled: true, mode: 'percent', percent: rate, fixedMinor: 0 }
  }
  return null
}

export function mapScannedReceipt(raw: unknown, currency: string): ReceiptDraft {
  const empty: ReceiptDraft = {
    items: [],
    service: null,
    tax: null,
    discount: null,
    actualTotalMinor: null,
    currency: null,
    droppedItems: 0,
  }
  if (!raw || typeof raw !== 'object') return empty

  const data = raw as ScannedReceipt
  const rows = Array.isArray(data.items) ? data.items.slice(0, MAX_ITEMS) : []

  const items: DraftItem[] = []
  let droppedItems = Array.isArray(data.items)
    ? Math.max(0, data.items.length - MAX_ITEMS)
    : 0

  for (const row of rows) {
    const name = typeof row?.name === 'string' ? row.name.trim() : ''
    const price = money(row?.unitPrice)
    // A line with no name, or no readable price, is not recoverable — better
    // to drop it and say so than to add a blank row the organizer must hunt for.
    if (!name || price === null) {
      droppedItems++
      continue
    }
    items.push({
      id: newId(),
      name: name.slice(0, 80),
      unitPriceMinor: toMinor(price, currency),
      quantity: quantity(row?.quantity),
      shared: false,
      confidence: confidence(row?.confidence),
    })
  }

  const printedTotal = money(data.printedTotal)
  const code = typeof data.currencyCode === 'string' ? data.currencyCode.toUpperCase() : null

  return {
    items,
    // The Egyptian defaults (12% / 14%) are only carried as the fallback for
    // the percent field, so flipping the mode toggle later shows something
    // sensible rather than 0.
    service: charge(data.serviceAmount, data.servicePercent, currency, 12),
    tax: charge(data.taxAmount, data.taxPercent, currency, 14),
    discount: charge(data.discountAmount, undefined, currency, 0),
    actualTotalMinor: printedTotal === null ? null : toMinor(printedTotal, currency),
    currency: code && CURRENCIES.some((c) => c.code === code) ? code : null,
    droppedItems,
  }
}

/** Sum of the draft's own line items, for showing against the printed total. */
export function draftItemsTotalMinor(draft: ReceiptDraft): number {
  return draft.items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0)
}
