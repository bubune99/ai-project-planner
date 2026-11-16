/** The count shown the moment after a press, before the server has answered: never below nothing. Pure. */
export function countAfter(count: number, delta: number): number {
  const n = Math.round((Number(count) || 0) + (Number(delta) || 0))
  return n < 0 ? 0 : n
}
