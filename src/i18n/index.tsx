/**
 * Tiny hand-rolled i18n. No library — two dictionaries, a context, and a
 * `t()` function that fills `{placeholders}`.
 *
 * Switching language also flips the document direction, which is what makes
 * the whole layout mirror for Arabic. All the CSS uses logical properties
 * (margin-inline-start, etc.) so nothing else has to change.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { en } from './en'
import type { TKey } from './en'
import { ar } from './ar'

export type Lang = 'en' | 'ar'

const DICTS = { en, ar } as const
const LANG_STORAGE_KEY = 'billsplitter.lang'

export type TFunction = (key: TKey, vars?: Record<string, string | number>) => string

interface I18nValue {
  lang: Lang
  dir: 'ltr' | 'rtl'
  setLang: (lang: Lang) => void
  toggleLang: () => void
  t: TFunction
}

const I18nContext = createContext<I18nValue | null>(null)

function readInitialLang(): Lang {
  const saved = localStorage.getItem(LANG_STORAGE_KEY)
  if (saved === 'en' || saved === 'ar') return saved
  // Fall back to the phone's own language.
  return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang)
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => setLangState(next), [])
  const toggleLang = useCallback(() => setLangState((l) => (l === 'en' ? 'ar' : 'en')), [])

  const t = useCallback<TFunction>(
    (key, vars) => {
      let text: string = DICTS[lang][key] ?? key
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
      }
      return text
    },
    [lang],
  )

  const value = useMemo<I18nValue>(
    () => ({ lang, dir, setLang, toggleLang, t }),
    [lang, dir, setLang, toggleLang, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
