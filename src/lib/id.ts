/** Short unique ids for items, participants, and bills. */
function randomHex(length: number): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(Math.ceil(length / 2))
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length)
  }
  return Math.random().toString(36).slice(2, 2 + length)
}

/** Ids for things that only ever exist inside one bill. */
export function newId(): string {
  return randomHex(8)
}

/**
 * The id for a bill. Longer, because it goes in the share link and is the only
 * thing standing between a stranger and the bill's contents — there are no
 * logins, so knowing the id IS the credential. 20 hex characters is 80 bits,
 * which is not guessable.
 */
export function newBillId(): string {
  return randomHex(20)
}
