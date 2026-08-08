/**
 * "Scan receipt": photo -> Gemini -> a review sheet -> the bill.
 *
 * The one rule this component exists to enforce: **nothing the model returns
 * ever reaches the bill unreviewed.** Extraction of a crumpled thermal receipt
 * is good, not perfect, so the organizer always sees an editable list first,
 * with the printed total cross-checked against it. If the model dropped a
 * line, that check says so before any money is divided.
 */
import { useRef, useState } from 'react'
import { useBill } from '../state/BillContext'
import { useI18n } from '../i18n'
import { prepareReceiptImage } from '../lib/image'
import { isScanAvailable, scanReceipt, ScanError } from '../lib/receiptScan'
import type { ScanErrorCode } from '../lib/receiptScan'
import { mapScannedReceipt, draftItemsTotalMinor } from '../lib/receipt'
import type { ReceiptDraft, DraftItem } from '../lib/receipt'
import { formatMoney, minorToInputString, parseToMinor } from '../lib/money'
import { QuantityStepper } from './QuantityStepper'

/** Shown once, before the first photo ever leaves the device. */
const CONSENT_KEY = 'billsplitter.scanConsent'

/** Below this the model is telling us it guessed. */
const UNSURE_BELOW = 0.6

type Stage =
  | { name: 'idle' }
  | { name: 'consent' }
  | { name: 'preparing' }
  | { name: 'reading' }
  | { name: 'review'; draft: ReceiptDraft }
  | { name: 'error'; code: ScanErrorCode | 'image' }

export function ScanReceipt() {
  const { bill, dispatch } = useBill()
  const { t, lang } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>({ name: 'idle' })
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [applyCharges, setApplyCharges] = useState(true)

  if (!isScanAvailable()) return null

  const money = (minor: number) => formatMoney(minor, bill.currency, lang)

  function openCamera() {
    if (localStorage.getItem(CONSENT_KEY) !== 'yes') {
      setStage({ name: 'consent' })
      return
    }
    inputRef.current?.click()
  }

  async function handleFile(file: File) {
    setStage({ name: 'preparing' })
    try {
      const image = await prepareReceiptImage(file)
      setStage({ name: 'reading' })
      const raw = await scanReceipt(image)
      const draft = mapScannedReceipt(raw, bill.currency)
      setDraftItems(draft.items)
      setApplyCharges(true)
      setStage({ name: 'review', draft })
    } catch (error) {
      if (error instanceof ScanError) setStage({ name: 'error', code: error.code })
      else setStage({ name: 'error', code: 'image' })
    }
  }

  /** Commit the reviewed rows. Merges into the bill — never replaces it. */
  function apply(draft: ReceiptDraft) {
    for (const item of draftItems) {
      dispatch({
        type: 'addItem',
        item: {
          name: item.name,
          priceMinor: item.priceMinor,
          priceMode: item.priceMode,
          quantity: item.quantity,
          shared: item.shared,
          sharedWith: item.sharedWith,
        },
      })
    }

    if (applyCharges) {
      if (draft.currency && draft.currency !== bill.currency) {
        dispatch({ type: 'setCurrency', currency: draft.currency })
      }
      if (draft.service) dispatch({ type: 'setCharge', key: 'service', patch: draft.service })
      if (draft.tax) dispatch({ type: 'setCharge', key: 'tax', patch: draft.tax })
      if (draft.discount) dispatch({ type: 'setCharge', key: 'discount', patch: draft.discount })
      // Feeding the printed total in is what arms the existing cross-check, so
      // a dropped line shows up as a mismatch the moment this sheet closes.
      if (draft.actualTotalMinor !== null) {
        dispatch({ type: 'setActualTotal', minor: draft.actualTotalMinor })
      }
    }

    setStage({ name: 'idle' })
    setDraftItems([])
  }

  return (
    <>
      <button type="button" className="btn btn--ghost scan-trigger" onClick={openCamera}>
        📷 {t('scan.button')}
      </button>

      {/* `capture="environment"` opens the rear camera directly on both iOS and
          Android, with no permission dance and no library. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset, so picking the same file twice still fires a change event.
          e.target.value = ''
          if (file) handleFile(file)
        }}
      />

      {stage.name !== 'idle' && (
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="sheet__panel">
            {stage.name === 'consent' && (
              <>
                <h2 className="sheet__title">{t('scan.consentTitle')}</h2>
                <p className="sheet__body">{t('scan.consentBody')}</p>
                <div className="sheet__actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setStage({ name: 'idle' })}
                  >
                    {t('scan.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      localStorage.setItem(CONSENT_KEY, 'yes')
                      setStage({ name: 'idle' })
                      inputRef.current?.click()
                    }}
                  >
                    {t('scan.consentAgree')}
                  </button>
                </div>
              </>
            )}

            {(stage.name === 'preparing' || stage.name === 'reading') && (
              <div className="sheet__busy">
                <div className="spinner" aria-hidden="true" />
                <p className="sheet__title">
                  {stage.name === 'preparing' ? t('scan.preparing') : t('scan.reading')}
                </p>
                <p className="sheet__body">{t('scan.readingHint')}</p>
              </div>
            )}

            {stage.name === 'error' && (
              <>
                <h2 className="sheet__title">{t('scan.button')}</h2>
                <div className="alert alert--warn">
                  <p className="alert__text">
                    {t(`scan.err.${stage.code}` as 'scan.err.unknown')}
                  </p>
                </div>
                <p className="sheet__body">{t('scan.tip')}</p>
                <div className="sheet__actions">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setStage({ name: 'idle' })}
                  >
                    {t('scan.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => inputRef.current?.click()}
                  >
                    {t('scan.retake')}
                  </button>
                </div>
              </>
            )}

            {stage.name === 'review' && (
              <ReviewPanel
                draft={stage.draft}
                items={draftItems}
                setItems={setDraftItems}
                applyCharges={applyCharges}
                setApplyCharges={setApplyCharges}
                currency={bill.currency}
                money={money}
                onCancel={() => {
                  setStage({ name: 'idle' })
                  setDraftItems([])
                }}
                onRetake={() => inputRef.current?.click()}
                onApply={() => apply(stage.draft)}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------------- */

interface ReviewProps {
  draft: ReceiptDraft
  items: DraftItem[]
  setItems: (items: DraftItem[]) => void
  applyCharges: boolean
  setApplyCharges: (value: boolean) => void
  currency: string
  money: (minor: number) => string
  onCancel: () => void
  onRetake: () => void
  onApply: () => void
}

function ReviewPanel({
  draft,
  items,
  setItems,
  applyCharges,
  setApplyCharges,
  currency,
  money,
  onCancel,
  onRetake,
  onApply,
}: ReviewProps) {
  const { t } = useI18n()

  const itemsTotal = draftItemsTotalMinor({ ...draft, items })
  const printed = draft.actualTotalMinor
  // A rough check only: the printed total includes service and tax, so it will
  // legitimately exceed the items. We only shout when the items exceed it,
  // which can only mean something was read twice or read wrong.
  const overshoot = printed !== null ? itemsTotal - printed : 0

  function update(id: string, patch: Partial<DraftItem>) {
    setItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  if (items.length === 0) {
    return (
      <>
        <h2 className="sheet__title">{t('scan.reviewTitle')}</h2>
        <p className="empty">{t('scan.nothingFound')}</p>
        <p className="sheet__body">{t('scan.tip')}</p>
        <div className="sheet__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            {t('scan.cancel')}
          </button>
          <button type="button" className="btn btn--primary" onClick={onRetake}>
            {t('scan.retake')}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="sheet__title">{t('scan.reviewTitle')}</h2>
      <p className="sheet__body">{t('scan.reviewHint')}</p>
      {draft.droppedItems > 0 && (
        <p className="note note--bad">{t('scan.dropped', { n: draft.droppedItems })}</p>
      )}

      <ul className="scan-list">
        {items.map((item) => (
          <li
            key={item.id}
            className={`scan-row ${item.confidence < UNSURE_BELOW ? 'scan-row--unsure' : ''}`}
          >
            <div className="scan-row__top">
              <input
                className="input scan-row__name"
                value={item.name}
                aria-label={t('items.name')}
                onChange={(e) => update(item.id, { name: e.target.value })}
              />
              <button
                type="button"
                className="btn btn--tiny btn--danger"
                aria-label={t('items.delete')}
                onClick={() => setItems(items.filter((row) => row.id !== item.id))}
              >
                ✕
              </button>
            </div>
            <div className="scan-row__bottom">
              <input
                className="input scan-row__price"
                inputMode="decimal"
                aria-label={item.priceMode === 'line' ? t('items.lineTotal') : t('items.unitPrice')}
                defaultValue={minorToInputString(item.priceMinor, currency)}
                onChange={(e) => {
                  const parsed = parseToMinor(e.target.value, currency)
                  if (parsed !== null) update(item.id, { priceMinor: parsed })
                }}
              />
              <QuantityStepper
                value={item.quantity}
                onChange={(quantity) => update(item.id, { quantity })}
                ariaLabel={t('items.qty')}
              />
              {item.confidence < UNSURE_BELOW && (
                <span className="chip chip--bad">{t('scan.unsure')}</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* What was found below the line, and the printed total that will arm
          the bill's own cross-check. */}
      {(draft.service || draft.tax || draft.discount || printed !== null) && (
        <div className="scan-charges">
          <span className="field__label">{t('scan.foundCharges')}</span>
          <ul className="scan-charges__list">
            {draft.service && (
              <li>
                <span>{t('charges.service')}</span>
                <span>
                  {draft.service.mode === 'percent'
                    ? `${draft.service.percent}%`
                    : money(draft.service.fixedMinor)}
                </span>
              </li>
            )}
            {draft.tax && (
              <li>
                <span>{t('charges.tax')}</span>
                <span>
                  {draft.tax.mode === 'percent'
                    ? `${draft.tax.percent}%`
                    : money(draft.tax.fixedMinor)}
                </span>
              </li>
            )}
            {draft.discount && (
              <li>
                <span>{t('charges.discount')}</span>
                <span>{money(draft.discount.fixedMinor)}</span>
              </li>
            )}
            {printed !== null && (
              <li className="is-strong">
                <span>{t('scan.printedTotal')}</span>
                <span>{money(printed)}</span>
              </li>
            )}
          </ul>
          <label className="check">
            <input
              type="checkbox"
              checked={applyCharges}
              onChange={(e) => setApplyCharges(e.target.checked)}
            />
            <span className="check__title">{t('scan.applyCharges')}</span>
          </label>
        </div>
      )}

      <p className="field__hint">{t('scan.itemsAddUp', { amount: money(itemsTotal) })}</p>
      {overshoot > 0 && (
        <p className="note note--bad">
          {t('scan.doesNotMatch', { amount: money(overshoot) })}
        </p>
      )}

      <div className="sheet__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {t('scan.cancel')}
        </button>
        <button type="button" className="btn btn--primary" onClick={onApply}>
          {t('scan.apply', { n: items.length })}
        </button>
      </div>
    </>
  )
}
