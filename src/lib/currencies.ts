/** Supported currencies. EGP first because that is the default. */

export interface CurrencyInfo {
  code: string
  /** Number of decimal places. KWD famously uses 3 (1 dinar = 1000 fils). */
  decimals: number
  labelEn: string
  labelAr: string
  /** Short symbol shown next to amounts. */
  symbolEn: string
  symbolAr: string
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'EGP', decimals: 2, labelEn: 'Egyptian Pound', labelAr: 'جنيه مصري', symbolEn: 'EGP', symbolAr: 'ج.م' },
  { code: 'USD', decimals: 2, labelEn: 'US Dollar', labelAr: 'دولار أمريكي', symbolEn: '$', symbolAr: '$' },
  { code: 'EUR', decimals: 2, labelEn: 'Euro', labelAr: 'يورو', symbolEn: '€', symbolAr: '€' },
  { code: 'GBP', decimals: 2, labelEn: 'British Pound', labelAr: 'جنيه إسترليني', symbolEn: '£', symbolAr: '£' },
  { code: 'SAR', decimals: 2, labelEn: 'Saudi Riyal', labelAr: 'ريال سعودي', symbolEn: 'SAR', symbolAr: 'ر.س' },
  { code: 'AED', decimals: 2, labelEn: 'UAE Dirham', labelAr: 'درهم إماراتي', symbolEn: 'AED', symbolAr: 'د.إ' },
  { code: 'KWD', decimals: 3, labelEn: 'Kuwaiti Dinar', labelAr: 'دينار كويتي', symbolEn: 'KWD', symbolAr: 'د.ك' },
]

export const DEFAULT_CURRENCY = 'EGP'

export function getCurrency(code: string): CurrencyInfo {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]
}
