/**
 * Reading a receipt photo with Gemini, via Firebase AI Logic.
 *
 * Why this route: the app is a static site, so anything in the bundle is
 * public. A raw model API key would be extracted and drained within a day.
 * Firebase AI Logic authenticates the request as *this Firebase app* and
 * forwards it to Gemini, so there is no key here to steal. App Check is what
 * stops someone pointing their own script at the project (and becomes
 * mandatory on 2 November 2026).
 *
 * The SDK is behind a dynamic import, exactly like Firestore, so a bill typed
 * in by hand never downloads any of this.
 */

import type { ScannedReceipt } from './receipt'
import { isFirebaseConfigured } from './firebase'

/**
 * Models, best first. Google retires these on a schedule — Gemini 2.5 shuts
 * down in October 2026 — so rather than pinning one id and breaking silently,
 * we walk the list until one answers, then remember which worked.
 */
const MODEL_CANDIDATES = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite']
const MODEL_MEMO_KEY = 'billsplitter.scanModel'

export type ScanErrorCode =
  /** No Firebase config in this build. */
  | 'not-configured'
  /** Firebase AI Logic has not been switched on in the console. */
  | 'not-enabled'
  /** Daily or per-minute free-tier quota is used up. */
  | 'quota'
  /** No signal, or the request was blocked. */
  | 'network'
  /** The model answered, but there was no bill in the picture. */
  | 'unreadable'
  | 'unknown'

export class ScanError extends Error {
  // Declared and assigned separately rather than as a constructor parameter
  // property: this project builds with `erasableSyntaxOnly`, which forbids the
  // shorthand because it emits runtime code from a type-position annotation.
  readonly code: ScanErrorCode

  constructor(code: ScanErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'ScanError'
    this.code = code
  }
}

export function isScanAvailable(): boolean {
  return isFirebaseConfigured()
}

/**
 * What we ask for. A schema rather than "please return JSON" because the SDK
 * then constrains generation, which removes a whole class of parse failures.
 */
async function buildSchema() {
  const { Schema } = await import('firebase/ai')
  return Schema.object({
    properties: {
      items: Schema.array({
        items: Schema.object({
          properties: {
            name: Schema.string({ description: 'The item name exactly as printed.' }),
            price: Schema.number({
              description: 'The price figure printed against this line, copied verbatim.',
            }),
            priceIsLineTotal: Schema.boolean({
              description:
                'True if that figure is the total for the whole line; false if it is the price of one unit.',
            }),
            quantity: Schema.integer({ description: 'How many were ordered. 1 if not shown.' }),
            confidence: Schema.number({
              description: '0 to 1. How sure you are of this whole line.',
            }),
          },
        }),
      }),
      serviceAmount: Schema.number({ description: 'Service charge amount, 0 if none.' }),
      servicePercent: Schema.number({ description: 'Service charge %, 0 if not shown.' }),
      taxAmount: Schema.number({ description: 'Tax/VAT amount, 0 if none.' }),
      taxPercent: Schema.number({ description: 'Tax/VAT %, 0 if not shown.' }),
      discountAmount: Schema.number({ description: 'Discount amount, 0 if none.' }),
      printedTotal: Schema.number({
        description: 'The final total printed on the receipt. Copy it, do not calculate it.',
      }),
      currencyCode: Schema.string({ description: 'ISO code such as EGP, or empty if unclear.' }),
    },
  })
}

const PROMPT = `You are reading a photograph of a restaurant bill.

Extract every ordered line item, plus the charges at the bottom.

Rules:
- The receipt may be in Arabic, English, or both. Return item names in the
  language they are printed in. Do not translate.
- Copy the price figure EXACTLY as printed. Never divide or multiply it.
  Instead set priceIsLineTotal to say what it means:
    "3 Tea   45.00"  -> price 45.00, quantity 3, priceIsLineTotal true
    "Tea     15.00 x3" -> price 15.00, quantity 3, priceIsLineTotal false
  If a receipt shows both a unit price and a line total, report the unit price
  with priceIsLineTotal false. If you cannot tell, prefer the line total.
- Do not invent items. If a line is illegible, leave it out and lower your
  confidence on the rest.
- Do not include service, tax, VAT, discounts, tips or the total as items.
  They belong in their own fields.
- printedTotal must be copied exactly from the receipt. Never compute it.
  If no total is printed, return 0.
- Egyptian receipts usually apply the service charge first, then VAT on
  (food + service). Report the amounts as printed; do not reconcile them.
- Return numbers as plain decimals with no currency symbols or separators.
- confidence is per line: 1.0 for crisp text you are certain of, below 0.6 for
  anything smudged, cut off, or guessed.`

/** Turn whatever the SDK threw into something the UI can phrase for a human. */
function classify(error: unknown): ScanError {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  const text = raw.toLowerCase()

  if (text.includes('quota') || text.includes('resource_exhausted') || text.includes('429')) {
    return new ScanError('quota', raw)
  }
  if (
    text.includes('not enabled') ||
    text.includes('has not been used') ||
    text.includes('service_disabled') ||
    text.includes('permission_denied') ||
    text.includes('403')
  ) {
    return new ScanError('not-enabled', raw)
  }
  if (text.includes('fetch') || text.includes('network') || text.includes('offline')) {
    return new ScanError('network', raw)
  }
  return new ScanError('unknown', raw)
}

/** True when the failure means "this model id does not exist", so try the next. */
function isMissingModel(error: unknown): boolean {
  const text = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return text.includes('not found') || text.includes('404') || text.includes('is not supported')
}

export async function scanReceipt(image: {
  base64: string
  mimeType: string
}): Promise<ScannedReceipt> {
  if (!isFirebaseConfigured()) throw new ScanError('not-configured')

  const [{ initializeApp, getApps }, ai] = await Promise.all([
    import('firebase/app'),
    import('firebase/ai'),
  ])

  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    })

  const backend = ai.getAI(app, { backend: new ai.GoogleAIBackend() })
  const responseSchema = await buildSchema()

  // Try the remembered model first, then the rest.
  const remembered = localStorage.getItem(MODEL_MEMO_KEY)
  const candidates = remembered
    ? [remembered, ...MODEL_CANDIDATES.filter((m) => m !== remembered)]
    : MODEL_CANDIDATES

  let lastError: unknown = null

  for (const modelName of candidates) {
    try {
      const model = ai.getGenerativeModel(backend, {
        model: modelName,
        generationConfig: { responseMimeType: 'application/json', responseSchema },
      })

      const result = await model.generateContent([
        { text: PROMPT },
        { inlineData: { mimeType: image.mimeType, data: image.base64 } },
      ])

      const text = result.response.text()
      if (!text) throw new ScanError('unreadable')

      localStorage.setItem(MODEL_MEMO_KEY, modelName)
      try {
        return JSON.parse(text) as ScannedReceipt
      } catch {
        throw new ScanError('unreadable', 'Model did not return valid JSON')
      }
    } catch (error) {
      lastError = error
      if (error instanceof ScanError) throw error
      // A retired or misnamed model: move on to the next candidate.
      if (isMissingModel(error)) {
        localStorage.removeItem(MODEL_MEMO_KEY)
        continue
      }
      throw classify(error)
    }
  }

  throw classify(lastError)
}
