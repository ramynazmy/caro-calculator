/**
 * A ~40-line hash router. There are exactly two destinations, so a routing
 * library would be more code than the thing it replaces.
 *
 * Hash routing (`#/b/abc`) rather than real paths is a deliberate choice for
 * GitHub Pages: the part after `#` never reaches the server, so a shared link
 * can never 404 no matter how Pages is configured. See the README.
 */
import { useEffect, useState } from 'react'

export type Route =
  /** The organizer's own app. */
  | { name: 'organizer' }
  /** A participant opening a share link: #/b/<billId> */
  | { name: 'claim'; billId: string }
  /** The instructions page: #/help */
  | { name: 'help' }

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [section, value] = path.split('/')
  if (section === 'b' && value) return { name: 'claim', billId: value }
  if (section === 'help') return { name: 'help' }
  return { name: 'organizer' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parse(location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}

/** The absolute URL a participant should be sent. */
export function claimUrl(billId: string): string {
  const { origin, pathname, search } = window.location
  return `${origin}${pathname}${search}#/b/${billId}`
}

export function goHome(): void {
  location.hash = ''
}
