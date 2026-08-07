/**
 * One item, with a stepper for how many of it a given person is taking.
 *
 * The stepper's ceiling is what is genuinely left — the ordered quantity minus
 * what everybody else has already claimed — so the group physically cannot
 * claim four of three steaks between them.
 */
import type { BillItem } from '../types'
import { formatMoney } from '../lib/money'
import { QuantityStepper } from './QuantityStepper'
import { useI18n } from '../i18n'

interface Props {
  item: BillItem
  currency: string
  /** How many this person has taken. */
  quantity: number
  /** The most they are allowed to take: ordered − claimed by everyone else. */
  maxQuantity: number
  onChange: (quantity: number) => void
  disabled?: boolean
}

export function ClaimRow({
  item,
  currency,
  quantity,
  maxQuantity,
  onChange,
  disabled,
}: Props) {
  const { t, lang } = useI18n()
  const available = maxQuantity - quantity
  const soldOut = maxQuantity === 0

  return (
    <div className={`claim-row ${quantity > 0 ? 'claim-row--picked' : ''}`}>
      <div className="claim-row__main">
        <div className="claim-row__name">{item.name}</div>
        <div className="claim-row__meta">
          {formatMoney(item.unitPriceMinor, currency, lang)} · {item.quantity}×
          {' · '}
          <span className={available === 0 ? 'claim-row__left--none' : 'claim-row__left'}>
            {available === 0 ? t('assign.allClaimed') : t('assign.remaining', { n: available })}
          </span>
        </div>
      </div>

      <div className="claim-row__side">
        {quantity > 0 && (
          <div className="claim-row__amount">
            {formatMoney(item.unitPriceMinor * quantity, currency, lang)}
          </div>
        )}
        <QuantityStepper
          value={quantity}
          onChange={onChange}
          min={0}
          // Never let the control offer more than is actually left.
          max={Math.max(0, maxQuantity)}
          disabled={disabled || (soldOut && quantity === 0)}
          ariaLabel={item.name}
        />
      </div>
    </div>
  )
}
