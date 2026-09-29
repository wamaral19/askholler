/** Returns a copy of `items` with the item at `index` moved one step. */
export function moveItem<T>(
  items: readonly T[],
  index: number,
  delta: -1 | 1,
): T[] {
  const target = index + delta;
  const next = [...items];
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
