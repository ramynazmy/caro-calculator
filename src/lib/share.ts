/** Turning a finished split into something you can paste into WhatsApp. */

import type { Bill } from '../types'
import type { SplitResult } from './shares'
import { formatMoney } from './money'
import type { Lang } from '../i18n'
import type { TFunction } from '../i18n'

/**
 * A plain-text summary. Deliberately plain: WhatsApp mangles most formatting,
 * and this needs to stay readable when it is quoted, forwarded, and read on a
 * cracked phone screen.
 */
export function buildSummaryText(
  bill: Bill,
  result: SplitResult,
  t: TFunction,
  lang: Lang,
): string {
  const money = (minor: number) => formatMoney(minor, bill.currency, lang)
  const lines: string[] = []

  lines.push(bill.title.trim() || t('app.title'))
  lines.push('—'.repeat(20))

  for (const share of result.shares) {
    const heading =
      share.partySize > 1 ? `${share.name} (${share.partySize})` : share.name
    lines.push(`${heading}: ${money(share.totalMinor)}`)

    for (const line of share.lines) {
      const suffix = line.sharedWays ? ` (${t('summary.splitWays', { n: line.sharedWays })})` : ''
      lines.push(`  • ${line.quantity}× ${line.name}${suffix}`)
    }
    if (share.communalMinor > 0) {
      lines.push(`  • ${t('summary.communalShare')}: ${money(share.communalMinor)}`)
    }
    const extras = share.serviceMinor + share.taxMinor
    if (extras > 0) {
      lines.push(`  • ${t('summary.serviceAndTax')}: ${money(extras)}`)
    }
    if (share.discountMinor > 0) {
      lines.push(`  • ${t('totals.discount')}: −${money(share.discountMinor)}`)
    }
    if (share.tipsMinor > 0) {
      lines.push(`  • ${t('summary.tipShare')}: ${money(share.tipsMinor)}`)
    }
    if (share.roundUpMinor > 0) {
      lines.push(`  • ${t('summary.roundUp')}: +${money(share.roundUpMinor)}`)
    }
    lines.push('')
  }

  lines.push('—'.repeat(20))
  lines.push(`${t('summary.billTotal')}: ${money(result.totals.calculatedTotalMinor)}`)
  if (result.tipsTotalMinor > 0) {
    lines.push(`${t('summary.tipsTotal')}: ${money(result.tipsTotalMinor)}`)
  }
  lines.push(`${t('summary.grandTotal')}: ${money(result.grandTotalMinor)}`)

  return lines.join('\n')
}

/** A `wa.me` link that opens WhatsApp with the text pre-filled. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

/**
 * Copy to the clipboard, falling back to the old `execCommand` route.
 * The modern API needs a secure context, which `http://` on a phone over the
 * local network is not — and that is exactly how this gets tested.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
