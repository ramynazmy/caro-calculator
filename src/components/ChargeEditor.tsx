/**
 * One optional charge (discount / service / tax): an on-off switch, a
 * percentage-or-amount toggle, and the value. Shows the resulting money amount
 * live so the organizer can sanity-check against the receipt.
 */
import type { Charge } from '../types'
import { formatMoney, parseNumber } from '../lib/money'
import { MoneyInput } from './MoneyInput'
import { useI18n } from '../i18n'
import type { ReactNode } from 'react'

interface Props {
  label: string
  charge: Charge
  currency: string
  /** What this charge currently works out to, in minor units. */
  resultMinor: number
  /** Shown below the value when the charge is on — e.g. the tax-base checkbox. */
  extra?: ReactNode
  onChange: (patch: Partial<Charge>) => void
}

export function ChargeEditor({
  label,
  charge,
  currency,
  resultMinor,
  extra,
  onChange,
}: Props) {
  const { t, lang } = useI18n()

  return (
    <div className={`charge ${charge.enabled ? 'charge--on' : ''}`}>
      <div className="charge__head">
        <label className="switch">
          <input
            type="checkbox"
            checked={charge.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          <span className="switch__track" aria-hidden="true">
            <span className="switch__thumb" />
          </span>
          <span className="charge__label">{label}</span>
        </label>

        <span className="charge__result">
          {charge.enabled ? formatMoney(resultMinor, currency, lang) : t('charges.off')}
        </span>
      </div>

      {charge.enabled && (
        <div className="charge__body">
          <div className="segmented" role="group" aria-label={label}>
            <button
              type="button"
              className={`segmented__btn ${charge.mode === 'percent' ? 'is-active' : ''}`}
              aria-pressed={charge.mode === 'percent'}
              onClick={() => onChange({ mode: 'percent' })}
            >
              {t('charges.percent')}
            </button>
            <button
              type="button"
              className={`segmented__btn ${charge.mode === 'fixed' ? 'is-active' : ''}`}
              aria-pressed={charge.mode === 'fixed'}
              onClick={() => onChange({ mode: 'fixed' })}
            >
              {t('charges.fixed')}
            </button>
          </div>

          {charge.mode === 'percent' ? (
            <div className="percent-input">
              <input
                className="input"
                type="text"
                inputMode="decimal"
                aria-label={`${label} — ${t('charges.percentValue')}`}
                value={String(charge.percent)}
                onChange={(e) => {
                  const parsed = parseNumber(e.target.value)
                  onChange({ percent: parsed === null ? 0 : Math.max(0, parsed) })
                }}
              />
              <span className="percent-input__suffix" aria-hidden="true">
                %
              </span>
            </div>
          ) : (
            <MoneyInput
              currency={currency}
              ariaLabel={`${label} — ${t('charges.fixedValue')}`}
              valueMinor={charge.fixedMinor}
              onChange={(minor) => onChange({ fixedMinor: minor ?? 0 })}
            />
          )}
        </div>
      )}

      {charge.enabled && extra}
    </div>
  )
}
