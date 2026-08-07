/**
 * Live totals plus the cross-check against the printed receipt.
 *
 * The cross-check is the whole point of this panel: it catches the mistyped
 * price or the item entered twice *before* the money gets divided up.
 */
import type { Bill } from '../types'
import type { BillTotals } from '../lib/calc'
import { serviceToMatchActual } from '../lib/calc'
import { formatMoney } from '../lib/money'
import { MoneyInput } from './MoneyInput'
import { useI18n } from '../i18n'

interface Props {
  bill: Bill
  totals: BillTotals
  onSetActual: (minor: number | null) => void
  onFixService: (fixedMinor: number) => void
}

export function TotalsPanel({ bill, totals, onSetActual, onFixService }: Props) {
  const { t, lang } = useI18n()
  const money = (minor: number) => formatMoney(minor, bill.currency, lang)

  const suggestedService = totals.hasMismatch ? serviceToMatchActual(bill) : null

  return (
    <section className="card totals">
      <h2 className="card__title">{t('totals.heading')}</h2>

      <dl className="totals__lines">
        <div className="totals__line">
          <dt>{t('totals.subtotal')}</dt>
          <dd>{money(totals.itemsSubtotalMinor)}</dd>
        </div>

        {totals.discountMinor > 0 && (
          <div className="totals__line totals__line--credit">
            <dt>{t('totals.discount')}</dt>
            <dd>−{money(totals.discountMinor)}</dd>
          </div>
        )}

        {bill.service.enabled && (
          <div className="totals__line">
            <dt>{t('totals.service')}</dt>
            <dd>{money(totals.serviceMinor)}</dd>
          </div>
        )}

        {bill.tax.enabled && (
          <div className="totals__line">
            <dt>{t('totals.tax')}</dt>
            <dd>{money(totals.taxMinor)}</dd>
          </div>
        )}

        <div className="totals__line totals__line--grand">
          <dt>{t('totals.calculated')}</dt>
          <dd>{money(totals.calculatedTotalMinor)}</dd>
        </div>

        {/* The tip is shown below the bill total, not folded into it, so the
            receipt comparison above stays a like-for-like check. */}
        {bill.tips.enabled && totals.tipsMinor > 0 && (
          <>
            <div className="totals__line">
              <dt>{t('totals.tips')}</dt>
              <dd>+{money(totals.tipsMinor)}</dd>
            </div>
            <div className="totals__line totals__line--grand">
              <dt>{t('totals.payable')}</dt>
              <dd>{money(totals.payableTotalMinor)}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="field totals__actual">
        <label className="field__label" htmlFor="actual-total">
          {t('totals.actual')}
        </label>
        <div className="totals__actual-row">
          <MoneyInput
            id="actual-total"
            currency={bill.currency}
            valueMinor={bill.actualTotalMinor}
            placeholder={t('totals.actualPlaceholder')}
            onChange={onSetActual}
          />
          {bill.actualTotalMinor !== null && (
            <button type="button" className="btn btn--ghost" onClick={() => onSetActual(null)}>
              {t('mismatch.clear')}
            </button>
          )}
        </div>
        <p className="field__hint">{t('totals.actualHint')}</p>
      </div>

      {bill.actualTotalMinor !== null &&
        (totals.hasMismatch ? (
          <div className="alert alert--warn" role="status">
            <p className="alert__text">
              {totals.differenceMinor! > 0
                ? t('mismatch.higher', { amount: money(totals.differenceMinor!) })
                : t('mismatch.lower', { amount: money(-totals.differenceMinor!) })}
            </p>
            {suggestedService !== null ? (
              <button
                type="button"
                className="btn btn--small"
                onClick={() => onFixService(suggestedService)}
              >
                {t('mismatch.fixService', { amount: money(suggestedService) })}
              </button>
            ) : (
              <p className="alert__note">{t('mismatch.cantFix')}</p>
            )}
          </div>
        ) : (
          <div className="alert alert--ok" role="status">
            <p className="alert__text">{t('mismatch.ok')}</p>
          </div>
        ))}
    </section>
  )
}
