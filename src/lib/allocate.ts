/**
 * Splitting an integer amount of money into weighted parts that still add up
 * to the original amount.
 *
 * This is the piece that keeps the bill honest. 100.00 EGP of service split
 * three ways is 33.333… each; rounding each one independently gives 33.33 × 3
 * = 99.99 and a piastre goes missing. Every share in this app therefore goes
 * through `allocate`, which floors each part and then hands the leftover units
 * to one nominated person — the organizer — so the parts always sum to exactly
 * what went in.
 */

/**
 * @param totalMinor  the amount to divide, in minor units. Must be >= 0.
 * @param weights     one weight per recipient. May be any non-negative numbers
 *                    (money amounts, party sizes, claimed quantities).
 * @param residueIndex who absorbs the rounding leftover — normally the
 *                    organizer. Pass -1 to give the leftover to whoever has
 *                    the largest fractional part instead (the classic
 *                    largest-remainder method).
 * @returns           one integer per weight; guaranteed to sum to totalMinor.
 */
export function allocate(
  totalMinor: number,
  weights: number[],
  residueIndex: number,
): number[] {
  const n = weights.length
  if (n === 0) return []
  if (totalMinor === 0) return new Array(n).fill(0)

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  let totalWeight = safeWeights.reduce((a, b) => a + b, 0)

  // Nothing to weigh by — e.g. a service charge on a bill where nobody has
  // claimed any food yet. Fall back to an even split so the money still lands
  // somewhere sensible instead of nowhere.
  if (totalWeight === 0) {
    safeWeights.fill(1)
    totalWeight = n
  }

  const floors = safeWeights.map((w) => Math.floor((totalMinor * w) / totalWeight))
  const distributed = floors.reduce((a, b) => a + b, 0)
  let residue = totalMinor - distributed // always in [0, n-1]

  // Only let the nominated absorber take the leftover if they are actually
  // part of this split. Handing a share of the discount to someone who ate
  // nothing could otherwise push their subtotal below zero.
  const canAbsorb =
    residueIndex >= 0 && residueIndex < n && safeWeights[residueIndex] > 0

  if (canAbsorb) {
    floors[residueIndex] += residue
    return floors
  }

  // Largest-remainder fallback: hand out the leftover units one at a time to
  // whoever was rounded down the hardest.
  const order = safeWeights
    .map((w, index) => ({
      index,
      fraction: (totalMinor * w) / totalWeight - Math.floor((totalMinor * w) / totalWeight),
    }))
    // Ties break by position so the result is deterministic, which matters
    // because two devices compute this independently.
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (let i = 0; residue > 0; i = (i + 1) % n, residue--) {
    floors[order[i].index] += 1
  }
  return floors
}
