/**
 * "Install app" — shown only on a phone, and only when the app is not already
 * installed.
 *
 * Two browsers, two mechanisms:
 *
 *   - Chrome/Edge/Samsung fire `beforeinstallprompt`. We keep that event and
 *     replay it when the button is tapped, which shows the real OS install
 *     sheet. The event only fires when the app is installable AND not already
 *     installed, so its presence is itself the "not installed" check.
 *
 *   - iOS Safari has no such event and no programmatic install at all. The
 *     only route is Share -> Add to Home Screen, so there the button reveals
 *     that instruction instead of pretending it can do it.
 *
 * In both cases the button disappears once the app is running standalone.
 */
import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'

/** The non-standard event Chromium fires when a site is installable. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Already installed? Standalone display is the reliable signal on both sides. */
function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, which predates the standard media query.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isIOS(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac; touch points give it away.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

/** A phone or tablet — a touch device on a smallish screen. */
function isMobile(): boolean {
  return navigator.maxTouchPoints > 0 && window.matchMedia('(max-width: 1024px)').matches
}

export function InstallButton() {
  const { t } = useI18n()
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    function onBeforeInstall(event: Event) {
      // Stop the browser's own mini-infobar so our button is the only offer.
      event.preventDefault()
      setPrompt(event as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)

    // Catches the case where the user installs, then opens the installed app
    // in the same session.
    const media = window.matchMedia('(display-mode: standalone)')
    const onDisplayChange = () => setInstalled(isStandalone())
    media.addEventListener('change', onDisplayChange)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      media.removeEventListener('change', onDisplayChange)
    }
  }, [])

  const iosCandidate = isIOS() && isMobile()
  // Nothing to offer: already installed, dismissed, not a phone, or the
  // browser never said it was installable.
  if (installed || dismissed || !isMobile() || (!prompt && !iosCandidate)) return null

  if (showIosHelp) {
    return (
      <div className="install install--help">
        <p className="install__text">{t('install.ios')}</p>
        <button type="button" className="btn btn--tiny" onClick={() => setDismissed(true)}>
          {t('install.dismiss')}
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      className="btn btn--small install__btn"
      onClick={async () => {
        if (prompt) {
          await prompt.prompt()
          const { outcome } = await prompt.userChoice
          // The event is single-use; drop it either way.
          setPrompt(null)
          if (outcome === 'accepted') setInstalled(true)
        } else {
          setShowIosHelp(true)
        }
      }}
    >
      ⬇ {t('install.button')}
    </button>
  )
}
