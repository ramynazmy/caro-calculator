/** Phase 1 — the organizer types the receipt in here. */
import { useMemo } from 'react'
import { useBill } from '../state/BillContext'
import { computeTotals } from '../lib/calc'
import { CURRENCIES } from '../lib/currencies'
import { useI18n } from '../i18n'
import { ItemForm } from '../components/ItemForm'
import { ItemList } from '../components/ItemList'
import { ChargeEditor } from '../components/ChargeEditor'
import { TotalsPanel } from '../components/TotalsPanel'
import { ScanReceipt } from '../components/ScanReceipt'

export function BillEntry() {
  const { bill, dispatch } = useBill()
  const { t, lang } = useI18n()

  // Recomputed on every keystroke — the whole point is that totals are live.
  const totals = useMemo(() => computeTotals(bill), [bill])

  return (
    <div className="screen">
      {/* ---- Bill identity ------------------------------------------------ */}
      <section className="card">
        <div className="field">
          <label className="field__label" htmlFor="bill-title">
            {t('bill.title')}
          </label>
          <input
            id="bill-title"
            className="input"
            type="text"
            placeholder={t('bill.titlePlaceholder')}
            value={bill.title}
            onChange={(e) => dispatch({ type: 'setTitle', title: e.target.value })}
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="bill-currency">
            {t('bill.currency')}
          </label>
          <select
            id="bill-currency"
            className="input"
            value={bill.currency}
            onChange={(e) => dispatch({ type: 'setCurrency', currency: e.target.value })}
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {lang === 'ar' ? c.labelAr : c.labelEn}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* ---- Items -------------------------------------------------------- */}
      <section className="card">
        <div className="card__header">
          <h2 className="card__title">{t('items.heading')}</h2>
          <span className="card__count">{t('items.count', { n: bill.items.length })}</span>
        </div>

        {/* Scanning is a shortcut, not a dependency — the manual form below
            stays the primary path and works with no signal. */}
        <ScanReceipt />

        <ItemForm
          currency={bill.currency}
          participants={bill.participants}
          onSubmit={(draft) => dispatch({ type: 'addItem', item: draft })}
        />

        <ItemList
          items={bill.items}
          participants={bill.participants}
          currency={bill.currency}
          onUpdate={(id, patch) => dispatch({ type: 'updateItem', id, patch })}
          onDelete={(id) => dispatch({ type: 'deleteItem', id })}
        />
      </section>

      {/* ---- Discount / service / tax ------------------------------------- */}
      <section className="card">
        <h2 className="card__title">{t('charges.heading')}</h2>

        <ChargeEditor
          label={t('charges.discount')}
          charge={bill.discount}
          currency={bill.currency}
          resultMinor={totals.discountMinor}
          onChange={(patch) => dispatch({ type: 'setCharge', key: 'discount', patch })}
        />

        <ChargeEditor
          label={t('charges.service')}
          charge={bill.service}
          currency={bill.currency}
          resultMinor={totals.serviceMinor}
          onChange={(patch) => dispatch({ type: 'setCharge', key: 'service', patch })}
        />

        <ChargeEditor
          label={t('charges.tax')}
          charge={bill.tax}
          currency={bill.currency}
          resultMinor={totals.taxMinor}
          onChange={(patch) => dispatch({ type: 'setCharge', key: 'tax', patch })}
          // Which base the tax percentage applies to only matters when there
          // is a service charge and the tax is a percentage.
          extra={
            bill.service.enabled && bill.tax.mode === 'percent' ? (
              <label className="check check--nested">
                <input
                  type="checkbox"
                  checked={bill.taxAppliesToService}
                  onChange={(e) =>
                    dispatch({ type: 'setTaxAppliesToService', value: e.target.checked })
                  }
                />
                <span>
                  <span className="check__title">{t('charges.taxOnService')}</span>
                  <span className="check__hint">{t('charges.taxOnServiceHint')}</span>
                </span>
              </label>
            ) : null
          }
        />

        {/* A tip sits above the printed bill rather than inside it, so it is
            never part of the receipt cross-check. */}
        <ChargeEditor
          label={t('charges.tips')}
          charge={bill.tips}
          currency={bill.currency}
          resultMinor={totals.tipsMinor}
          onChange={(patch) => dispatch({ type: 'setCharge', key: 'tips', patch })}
          extra={<p className="check__hint">{t('charges.tipsHint')}</p>}
        />
      </section>

      {/* ---- Totals & receipt cross-check --------------------------------- */}
      <TotalsPanel
        bill={bill}
        totals={totals}
        onSetActual={(minor) => dispatch({ type: 'setActualTotal', minor })}
        onFixService={(fixedMinor) =>
          dispatch({
            type: 'setCharge',
            key: 'service',
            patch: { enabled: true, mode: 'fixed', fixedMinor },
          })
        }
      />

      <div className="screen__footer">
        <p className="muted">{t('phase.savedLocally')}</p>
        <button
          type="button"
          className="btn btn--ghost btn--danger"
          onClick={() => {
            if (confirm(t('actions.resetConfirm'))) dispatch({ type: 'reset' })
          }}
        >
          {t('actions.reset')}
        </button>
      </div>
    </div>
  )
}
