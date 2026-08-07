/**
 * The single source of truth for the bill being edited.
 *
 * A reducer keeps every mutation in one readable list, and an effect mirrors
 * the result into localStorage after each change.
 */
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import type { Dispatch, ReactNode } from 'react'
import type {
  Bill,
  BillItem,
  Charge,
  ChargeSplit,
  Claims,
  Participant,
  SplitBasis,
} from '../types'
import { DEFAULT_CURRENCY, getCurrency } from '../lib/currencies'
import { loadBill, saveBill, clearBill } from '../lib/storage'
import { newBillId, newId } from '../lib/id'

function emptyCharge(defaultPercent: number): Charge {
  return { enabled: false, mode: 'percent', percent: defaultPercent, fixedMinor: 0 }
}

export function createEmptyBill(): Bill {
  return {
    version: 3,
    id: newBillId(),
    title: '',
    currency: DEFAULT_CURRENCY,
    createdAt: Date.now(),
    items: [],
    discount: emptyCharge(0),
    // 12% service and 14% VAT are the usual Egyptian defaults; they only take
    // effect once the organizer switches the charge on.
    service: emptyCharge(12),
    tax: emptyCharge(14),
    taxAppliesToService: true,
    actualTotalMinor: null,
    participants: [],
    organizerId: null,
    splitBasis: 'perPerson',
    chargeSplit: 'proportional',
    claims: {},
    locked: false,
    respondedAt: {},
    published: false,
  }
}

type ChargeKey = 'discount' | 'service' | 'tax'

type Action =
  | { type: 'replace'; bill: Bill }
  | { type: 'setTitle'; title: string }
  | { type: 'setCurrency'; currency: string }
  | { type: 'addItem'; item: Omit<BillItem, 'id'> }
  | { type: 'updateItem'; id: string; patch: Partial<Omit<BillItem, 'id'>> }
  | { type: 'deleteItem'; id: string }
  | { type: 'setCharge'; key: ChargeKey; patch: Partial<Charge> }
  | { type: 'setTaxAppliesToService'; value: boolean }
  | { type: 'setActualTotal'; minor: number | null }
  | { type: 'addParticipant'; participant: Omit<Participant, 'id'> }
  | { type: 'updateParticipant'; id: string; patch: Partial<Omit<Participant, 'id'>> }
  | { type: 'deleteParticipant'; id: string }
  | { type: 'setOrganizer'; id: string }
  | { type: 'setSplitBasis'; basis: SplitBasis }
  | { type: 'setChargeSplit'; split: ChargeSplit }
  | { type: 'setClaim'; participantId: string; itemId: string; quantity: number }
  | { type: 'clearClaims'; participantId: string }
  | { type: 'mergeRemoteClaims'; claims: Claims; respondedAt: Record<string, number> }
  | { type: 'setLocked'; locked: boolean }
  | { type: 'setPublished'; published: boolean }
  | { type: 'reset' }

/**
 * Currencies do not all have two decimal places (KWD has three). Since we
 * store minor units, switching currency has to rescale every stored amount or
 * "12.50 EGP" would silently become "0.012 KWD".
 */
function rescaleAmounts(bill: Bill, nextCurrency: string): Bill {
  const from = getCurrency(bill.currency).decimals
  const to = getCurrency(nextCurrency).decimals
  if (from === to) return { ...bill, currency: nextCurrency }

  const factor = 10 ** (to - from)
  const conv = (minor: number) => Math.round(minor * factor)

  return {
    ...bill,
    currency: nextCurrency,
    items: bill.items.map((item) => ({ ...item, unitPriceMinor: conv(item.unitPriceMinor) })),
    discount: { ...bill.discount, fixedMinor: conv(bill.discount.fixedMinor) },
    service: { ...bill.service, fixedMinor: conv(bill.service.fixedMinor) },
    tax: { ...bill.tax, fixedMinor: conv(bill.tax.fixedMinor) },
    actualTotalMinor: bill.actualTotalMinor === null ? null : conv(bill.actualTotalMinor),
  }
}

function reducer(bill: Bill, action: Action): Bill {
  switch (action.type) {
    case 'replace':
      return action.bill

    case 'setTitle':
      return { ...bill, title: action.title }

    case 'setCurrency':
      return rescaleAmounts(bill, action.currency)

    case 'addItem':
      // Newest first: on a phone the item you just typed stays under your thumb.
      return { ...bill, items: [{ id: newId(), ...action.item }, ...bill.items] }

    case 'updateItem':
      return {
        ...bill,
        items: bill.items.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item,
        ),
      }

    case 'deleteItem': {
      // Drop the claims on that item too, or they linger invisibly and would
      // reappear if an item with the same id were ever restored.
      const claims: Claims = {}
      for (const [participantId, byItem] of Object.entries(bill.claims)) {
        const { [action.id]: _removed, ...rest } = byItem
        claims[participantId] = rest
      }
      return { ...bill, items: bill.items.filter((item) => item.id !== action.id), claims }
    }

    case 'setCharge':
      return { ...bill, [action.key]: { ...bill[action.key], ...action.patch } }

    case 'setTaxAppliesToService':
      return { ...bill, taxAppliesToService: action.value }

    case 'setActualTotal':
      return { ...bill, actualTotalMinor: action.minor }

    case 'addParticipant': {
      const participant: Participant = { id: newId(), ...action.participant }
      return {
        ...bill,
        // Appended, not prepended: people are read as a roll-call, and the
        // order you added them in is the order you remember them in.
        participants: [...bill.participants, participant],
        // Whoever is added first is assumed to be the one collecting the money.
        organizerId: bill.organizerId ?? participant.id,
      }
    }

    case 'updateParticipant':
      return {
        ...bill,
        participants: bill.participants.map((p) =>
          p.id === action.id ? { ...p, ...action.patch } : p,
        ),
      }

    case 'deleteParticipant': {
      const participants = bill.participants.filter((p) => p.id !== action.id)
      const { [action.id]: _claims, ...claims } = bill.claims
      const { [action.id]: _responded, ...respondedAt } = bill.respondedAt
      return {
        ...bill,
        participants,
        // Their claims go back into the pool rather than haunting the maths.
        claims,
        respondedAt,
        // Never leave the organizer pointing at someone who is gone.
        organizerId:
          bill.organizerId === action.id ? (participants[0]?.id ?? null) : bill.organizerId,
      }
    }

    case 'setOrganizer':
      return { ...bill, organizerId: action.id }

    case 'setSplitBasis':
      return { ...bill, splitBasis: action.basis }

    case 'setChargeSplit':
      return { ...bill, chargeSplit: action.split }

    case 'setClaim': {
      const forPerson = { ...(bill.claims[action.participantId] ?? {}) }
      // Store zero as absence, so the claims object stays small and
      // "has this person picked anything" is a simple key check.
      if (action.quantity > 0) forPerson[action.itemId] = action.quantity
      else delete forPerson[action.itemId]
      return { ...bill, claims: { ...bill.claims, [action.participantId]: forPerson } }
    }

    case 'clearClaims':
      return { ...bill, claims: { ...bill.claims, [action.participantId]: {} } }

    case 'mergeRemoteClaims':
      // Firestore is the authority for who picked what: each participant owns
      // their own document, so incoming data replaces the local copy wholesale.
      return { ...bill, claims: action.claims, respondedAt: action.respondedAt }

    case 'setLocked':
      return { ...bill, locked: action.locked }

    case 'setPublished':
      return { ...bill, published: action.published }

    case 'reset':
      clearBill()
      return createEmptyBill()
  }
}

interface BillContextValue {
  bill: Bill
  dispatch: Dispatch<Action>
}

const BillContext = createContext<BillContextValue | null>(null)

export function BillProvider({ children }: { children: ReactNode }) {
  const [bill, dispatch] = useReducer(reducer, null, () => loadBill() ?? createEmptyBill())

  useEffect(() => {
    saveBill(bill)
  }, [bill])

  const value = useMemo(() => ({ bill, dispatch }), [bill])
  return <BillContext.Provider value={value}>{children}</BillContext.Provider>
}

export function useBill(): BillContextValue {
  const ctx = useContext(BillContext)
  if (!ctx) throw new Error('useBill must be used inside <BillProvider>')
  return ctx
}
