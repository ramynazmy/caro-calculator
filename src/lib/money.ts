/**
 * Money helpers. Everything here works on integer *minor units*
 * (piastres / cents / fils). See the MONEY RULE note in `src/types.ts`.
 */

import { getCurrency } from './currencies'
import type { Lang } from '../i18n'

/** Arabic-Indic digits, so a phone keyboard set to Arabic still works. */
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EASTERN_ARABIC = '۰۱۲۳۴۵۶۷۸۹'

/** Turn any digit variant into plain 0-9 and normalise separators. */
function normaliseDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const ai = ARABIC_INDIC.indexOf(ch)
    if (ai >= 0) {
      out += String(ai)
      continue
    }
    const ea = EASTERN_ARABIC.indexOf(ch)
    if (ea >= 0) {
      out += String(ea)
      continue
    }
    // Arabic decimal separator -> dot
    if (ch === '٫') {
      out += '.'
      continue
    }
    // Thousands separators and stray spaces are dropped
    if (ch === ',' || ch === '،' || ch === '٬' || ch === ' ' || ch === ' ') continue
    out += ch
  }
  return out
}

/**
 * Parse user-typed text into minor units.
 * Returns `null` when the text is not a usable number, so callers can tell
 * "empty / invalid" apart from a genuine zero.
 */
export function parseToMinor(text: string, currencyCode: string): number | null {
  const cleaned = normaliseDigits(text).trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null
  const value = Number(cleaned)
  if (!Number.isFinite(value)) return null
  const { decimals } = getCurrency(currencyCode)
  return Math.round(value * 10 ** decimals)
}

/** Parse a plain (non-money) number such as a percentage or a quantity. */
export function parseNumber(text: string): number | null {
  const cleaned = normaliseDigits(text).trim()
  if (cleaned === '' || cleaned === '.' || cleaned === '-') return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : null
}

/** Minor units -> the bare editable string for an input box, e.g. "12.50". */
export function minorToInputString(minor: number, currencyCode: string): string {
  const { decimals } = getCurrency(currencyCode)
  return (minor / 10 ** decimals).toFixed(decimals)
}

/** Minor units -> a display string with grouping, e.g. "1,234.50". */
export function formatAmount(minor: number, currencyCode: string): string {
  const { decimals } = getCurrency(currencyCode)
  // 'en-US-u-nu-latn' keeps Western digits in both languages, which is what
  // people in Egypt actually read prices in.
  return new Intl.NumberFormat('en-US-u-nu-latn', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(minor / 10 ** decimals)
}

/** Minor units -> display string including the currency, e.g. "1,234.50 EGP". */
export function formatMoney(minor: number, currencyCode: string, lang: Lang): string {
  const info = getCurrency(currencyCode)
  const symbol = lang === 'ar' ? info.symbolAr : info.symbolEn
  return `${formatAmount(minor, currencyCode)} ${symbol}`
}

/** `percent` of `baseMinor`, rounded to the nearest minor unit. 14 means 14%. */
export function percentOfMinor(baseMinor: number, percent: number): number {
  return Math.round((baseMinor * percent) / 100)
}
